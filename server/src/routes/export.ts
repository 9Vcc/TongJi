import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole, canAccessBranch, getAccessibleBranchIds } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'
import { computeRanking, resolveQueryBranchId } from '../utils/welfare'
import prisma from '../lib/prisma'
import * as xlsx from 'xlsx'
import { toDecimal2 } from '../utils/validation'

// json2csv 无 TypeScript 类型定义
const Json2CSVParser = require('json2csv').Parser

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 生成导出文件名中的日期段（中文格式）
 * - MONTH: "2026年6月排名"
 * - WEEK: "2026年6月第X周排名"（X 为该周在该月的第几周，以周一日期为准）
 */
function formatExportDate(refDate: Date, cycle: StatCycle): string {
  const y = refDate.getFullYear()
  const m = refDate.getMonth() + 1
  if (cycle === StatCycle.MONTH) {
    return `${y}年${m}月排名`
  }
  // 按周：计算该周在该月的第几周（以周一所在日期为准）
  const firstDay = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const firstDayWeek = firstDay.getDay() || 7 // 1=周一...7=周日
  // 该月第一个周一的日期
  const firstMondayDate = firstDayWeek === 1 ? 1 : 9 - firstDayWeek
  // 当前周一是该月第几周
  const weekOfMonth = Math.floor((refDate.getDate() - firstMondayDate) / 7) + 1
  return `${y}年${m}月第${weekOfMonth}周排名`
}

/**
 * 解析导出周期参数：MONTH=按月，其他默认按周
 */
function resolveCycleParam(cycleParam: string | undefined): StatCycle {
  return cycleParam === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
}

/**
 * 按用户权限计算排名
 * - 指定单厅：直接调用 computeRanking
 * - 全部厅：会长查所有厅（branchFilter=undefined），超管仅查授权厅（分别查询后合并）
 *   修复超管未指定 branchId 时 computeRanking 查所有厅的越权漏洞
 * - 指定多厅（branchIds）：分别查询后合并（用于合厅组合并导出）
 */
async function computeRankingForUser(
  refDate: Date,
  branchFilter: number | undefined,
  cycle: StatCycle,
  currentUser: { role: Role; branchId: number | null; branchIds: number[] },
  branchIds?: number[]
) {
  // 合厅组合并导出：按指定的多个厅 ID 查询并合并
  // 各厅按各自 statCycle 查询，避免混合周期合厅组用统一 cycle 导致部分厅数据丢失
  if (branchIds && branchIds.length > 0) {
    const branchInfos = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, statCycle: true },
    })
    const branchCycleMap = new Map(branchInfos.map((b) => [b.id, b.statCycle]))
    const results = await Promise.all(
      branchIds.map((id) => {
        const bc = branchCycleMap.get(id) ?? cycle
        return computeRanking(refDate, id, bc)
      })
    )
    return results.flat()
  }
  if (branchFilter) {
    return computeRanking(refDate, branchFilter, cycle)
  }
  // 全部厅：会长查所有厅，超管仅查授权厅
  const accessibleIds = getAccessibleBranchIds(currentUser)
  if (accessibleIds === null) {
    // 会长：查所有厅
    return computeRanking(refDate, undefined, cycle)
  }
  if (accessibleIds.length === 0) return []
  // 超管：分别查询各授权厅后合并
  const results = await Promise.all(
    accessibleIds.map((id) => computeRanking(refDate, id, cycle))
  )
  return results.flat()
}

/**
 * 解析 branchIds 查询参数（逗号分隔），并做权限过滤
 */
function parseBranchIdsParam(
  param: string | undefined,
  currentUser: { role: Role; branchId: number | null; branchIds: number[] }
): number[] | undefined {
  if (!param) return undefined
  const ids = param
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
  if (ids.length === 0) return undefined
  // 权限过滤：超管仅保留授权厅，管理仅保留本厅，会长不限
  if (currentUser.role === Role.HUIZHANG) return ids
  if (currentUser.role === Role.CHAOGUAN) {
    return ids.filter((id) => canAccessBranch(currentUser, id))
  }
  return ids.filter((id) => id === currentUser.branchId)
}

export default async function exportRoutes(fastify: FastifyInstance) {
  // GET /api/export/excel - 导出Excel（支持按周/按月，仅超管及以上可访问）
  // 有冠名数据的厅：导出包含冠名列（按等级动态生成）和冠名福利列
  fastify.get(
    '/api/export/excel',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, branchIds: branchIdsParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; branchIds?: string }

      const cycle = resolveCycleParam(cycleParam)
      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)
      const branchIds = parseBranchIdsParam(branchIdsParam, currentUser)
      const ranking = await computeRankingForUser(refDate, branchFilter, cycle, currentUser, branchIds)

      // 查询相关厅的奖励规则（合并导出时可能涉及多个厅）
      // qmEnabled/zcEnabled：任一厅开启即显示对应列（避免数据丢失）
      const involvedBranchIds = branchIds ?? (branchFilter ? [branchFilter] : [])
      const rewardRules = involvedBranchIds.length > 0
        ? await prisma.rewardRule.findMany({
            where: { branchId: { in: involvedBranchIds } },
            include: { branch: { select: { name: true } } },
          })
        : []
      const qmEnabled = rewardRules.length > 0 ? rewardRules.some((r) => r.qmEnabled) : true
      const zcEnabled = rewardRules.length > 0 ? rewardRules.some((r) => r.zcEnabled) : false
      // 厅名用于导出文件名
      const branchName = rewardRules.length === 1
        ? rewardRules[0].branch?.name ?? ranking[0]?.branchName ?? '全部厅'
        : ranking[0]?.branchName ?? '全部厅'

      // 收集所有出现过的冠名等级（保持顺序，按 levelId 升序）
      // 记录 levelId → levelName；同名但不同 levelId 的等级视为同一列（累加）
      const namingLevels = new Map<number, string>()
      for (const r of ranking) {
        for (const n of r.namings ?? []) {
          if (!namingLevels.has(n.levelId)) {
            namingLevels.set(n.levelId, n.levelName)
          }
        }
      }
      const hasNaming = namingLevels.size > 0

      const data = ranking.map((r) => {
        const row: Record<string, string | number> = {
          排名: r.rank,
          姓名: r.personnelName,
          分部: r.branchName,
          收光: r.sg,
          麦序: r.mx,
        }
        // 仅开启全麦转换的厅才包含全麦列
        if (qmEnabled) {
          row['全麦'] = r.qm
        }
        // 开启主持福利的厅才包含主持天数和主持福利列
        if (zcEnabled) {
          row['主持天数'] = r.zcDays
        }
        row['基础福利'] = r.baseWelfare
        if (zcEnabled) {
          row['主持福利'] = r.zcWelfare
        }
        row['排名奖金'] = r.rankBonus
        row['麦序奖励'] = r.maixuBonus
        // 动态添加冠名列：每等级一列，列名固定为"冠名·等级名"
        // 合并导出时同名等级（不同 levelId）通过累加到同一列名避免覆盖丢数据
        if (hasNaming) {
          const namingMap = new Map<number, number>()
          for (const n of r.namings ?? []) {
            namingMap.set(n.levelId, n.count)
          }
          for (const [levelId, levelName] of namingLevels) {
            const colName = `冠名·${levelName}`
            const val = namingMap.get(levelId) ?? 0
            // 累加：处理多厅同名等级（不同 levelId）映射到同一列名的情况
            row[colName] = (row[colName] as number | undefined ?? 0) + val
          }
          row['冠名福利'] = r.namingWelfare
        }
        row['扣减'] = r.deduction
        // 总福利与页面显示一致：不含排名奖金（排名奖金仅作为排名激励信息列展示）
        row['总福利'] = toDecimal2(r.totalWelfare - r.rankBonus)
        return row
      })

      const sheetName = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const worksheet = xlsx.utils.json_to_sheet(data)
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName)
      const buffer = xlsx.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      })

      const filename = `${branchName}_${formatExportDate(refDate, cycle)}.xlsx`
      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(buffer)
    }
  )

  // GET /api/export/csv - 导出CSV（支持按周/按月，仅超管及以上可访问）
  // 有冠名数据的厅：导出包含冠名列（按等级动态生成）和冠名福利列
  fastify.get(
    '/api/export/csv',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, branchIds: branchIdsParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; branchIds?: string }

      const cycle = resolveCycleParam(cycleParam)
      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)
      const branchIds = parseBranchIdsParam(branchIdsParam, currentUser)
      const ranking = await computeRankingForUser(refDate, branchFilter, cycle, currentUser, branchIds)

      // 查询相关厅的奖励规则（合并导出时可能涉及多个厅）
      // qmEnabled/zcEnabled：任一厅开启即显示对应列（避免数据丢失）
      const involvedBranchIds = branchIds ?? (branchFilter ? [branchFilter] : [])
      const rewardRules = involvedBranchIds.length > 0
        ? await prisma.rewardRule.findMany({
            where: { branchId: { in: involvedBranchIds } },
            include: { branch: { select: { name: true } } },
          })
        : []
      const qmEnabled = rewardRules.length > 0 ? rewardRules.some((r) => r.qmEnabled) : true
      const zcEnabled = rewardRules.length > 0 ? rewardRules.some((r) => r.zcEnabled) : false
      // 厅名用于导出文件名
      const branchName = rewardRules.length === 1
        ? rewardRules[0].branch?.name ?? ranking[0]?.branchName ?? '全部厅'
        : ranking[0]?.branchName ?? '全部厅'

      // 收集所有出现过的冠名等级
      // 记录 levelId → levelName；同名但不同 levelId 的等级视为同一列（累加）
      const namingLevels = new Map<number, string>()
      for (const r of ranking) {
        for (const n of r.namings ?? []) {
          if (!namingLevels.has(n.levelId)) {
            namingLevels.set(n.levelId, n.levelName)
          }
        }
      }
      const hasNaming = namingLevels.size > 0
      // 收集不重复的 levelName（保持首次出现顺序），用于 CSV 字段定义
      const uniqueLevelNames: string[] = []
      const seenLevelNames = new Set<string>()
      for (const [, levelName] of namingLevels) {
        if (!seenLevelNames.has(levelName)) {
          seenLevelNames.add(levelName)
          uniqueLevelNames.push(levelName)
        }
      }

      // 构建 CSV 字段：基础列 + 动态冠名列 + 冠名福利 + 扣减 + 总福利
      // 未开启全麦转换的厅不包含全麦列
      const fields: { label: string; value: string }[] = [
        { label: '排名', value: 'rank' },
        { label: '姓名', value: 'personnelName' },
        { label: '分部', value: 'branchName' },
        { label: '收光', value: 'sg' },
        { label: '麦序', value: 'mx' },
      ]
      if (qmEnabled) {
        fields.push({ label: '全麦', value: 'qm' })
      }
      if (zcEnabled) {
        fields.push({ label: '主持天数', value: 'zcDays' })
      }
      fields.push({ label: '基础福利', value: 'baseWelfare' })
      if (zcEnabled) {
        fields.push({ label: '主持福利', value: 'zcWelfare' })
      }
      fields.push({ label: '排名奖金', value: 'rankBonus' })
      fields.push({ label: '麦序奖励', value: 'maixuBonus' })
      if (hasNaming) {
        // 列名固定为"冠名·等级名"，同名等级合并为一列
        for (const levelName of uniqueLevelNames) {
          fields.push({ label: `冠名·${levelName}`, value: `naming_${levelName}` })
        }
        fields.push({ label: '冠名福利', value: 'namingWelfare' })
      }
      fields.push({ label: '扣减', value: 'deduction' })
      fields.push({ label: '总福利', value: 'totalWelfare' })

      // 将 ranking 展平为 CSV 用的行数据
      // 同名等级（不同 levelId）的 count 累加到 naming_<levelName> 字段
      const flatRanking = ranking.map((r) => {
        const row: Record<string, string | number> = {
          rank: r.rank,
          personnelName: r.personnelName,
          branchName: r.branchName,
          sg: r.sg,
          mx: r.mx,
        }
        if (qmEnabled) {
          row['qm'] = r.qm
        }
        if (zcEnabled) {
          row['zcDays'] = r.zcDays
        }
        row['baseWelfare'] = r.baseWelfare
        if (zcEnabled) {
          row['zcWelfare'] = r.zcWelfare
        }
        row['rankBonus'] = r.rankBonus
        row['maixuBonus'] = r.maixuBonus
        if (hasNaming) {
          // 按 levelName 累加：同名等级（不同 levelId）合并
          const namingByName = new Map<string, number>()
          for (const n of r.namings ?? []) {
            namingByName.set(n.levelName, (namingByName.get(n.levelName) ?? 0) + n.count)
          }
          for (const levelName of uniqueLevelNames) {
            row[`naming_${levelName}`] = namingByName.get(levelName) ?? 0
          }
          row['namingWelfare'] = r.namingWelfare
        }
        row['deduction'] = r.deduction
        // 总福利与页面显示一致：不含排名奖金
        row['totalWelfare'] = toDecimal2(r.totalWelfare - r.rankBonus)
        return row
      })

      const parser = new Json2CSVParser({ fields })
      const csv = parser.parse(flatRanking)

      // 添加 BOM 以便 Excel 正确识别 UTF-8 编码
      const bom = '\uFEFF'
      const filename = `${branchName}_${formatExportDate(refDate, cycle)}.csv`
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(bom + csv)
    }
  )

  // GET /api/export/personnel-excel - 导出人员名单 Excel（仅超管及以上可访问）
  fastify.get(
    '/api/export/personnel-excel',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

      // 权限过滤：会长可指定任意厅；超管只能导出授权厅
      let branchFilter: number | undefined
      let branchInFilter: number[] | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) branchFilter = Number(branchIdParam)
      } else if (currentUser.role === Role.CHAOGUAN) {
        if (branchIdParam && canAccessBranch(currentUser, Number(branchIdParam))) {
          branchFilter = Number(branchIdParam)
        } else {
          branchInFilter = currentUser.branchIds
        }
      }

      const where = {
        ...(branchFilter
          ? { personnelBranches: { some: { branchId: branchFilter } } }
          : branchInFilter
            ? { personnelBranches: { some: { branchId: { in: branchInFilter } } } }
            : {}),
      }

      const personnel = await prisma.personnel.findMany({
        where,
        include: {
          personnelBranches: {
            include: { branch: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      // 厅名用于文件名
      const branchName = branchFilter
        ? personnel[0]?.personnelBranches.find((pb) => pb.branchId === branchFilter)?.branch.name ?? '全部厅'
        : '全部授权厅'

      const data = personnel.map((p, idx) => ({
        序号: idx + 1,
        姓名: p.name,
        所属厅: p.personnelBranches.map((pb) => pb.branch.name).join('、') || '-',
      }))

      const worksheet = xlsx.utils.json_to_sheet(data)
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, '人员名单')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const filename = `${branchName}_人员名单_${formatDate(new Date())}.xlsx`
      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(buffer)
    }
  )

  // GET /api/export/personnel-csv - 导出人员名单 CSV（仅超管及以上可访问）
  fastify.get(
    '/api/export/personnel-csv',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

      let branchFilter: number | undefined
      let branchInFilter: number[] | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) branchFilter = Number(branchIdParam)
      } else if (currentUser.role === Role.CHAOGUAN) {
        if (branchIdParam && canAccessBranch(currentUser, Number(branchIdParam))) {
          branchFilter = Number(branchIdParam)
        } else {
          branchInFilter = currentUser.branchIds
        }
      }

      const where = {
        ...(branchFilter
          ? { personnelBranches: { some: { branchId: branchFilter } } }
          : branchInFilter
            ? { personnelBranches: { some: { branchId: { in: branchInFilter } } } }
            : {}),
      }

      const personnel = await prisma.personnel.findMany({
        where,
        include: {
          personnelBranches: {
            include: { branch: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      const branchName = branchFilter
        ? personnel[0]?.personnelBranches.find((pb) => pb.branchId === branchFilter)?.branch.name ?? '全部厅'
        : '全部授权厅'

      const data = personnel.map((p, idx) => ({
        序号: idx + 1,
        姓名: p.name,
        所属厅: p.personnelBranches.map((pb) => pb.branch.name).join('、') || '-',
      }))

      const fields = [
        { label: '序号', value: '序号' },
        { label: '姓名', value: '姓名' },
        { label: '所属厅', value: '所属厅' },
      ]
      const parser = new Json2CSVParser({ fields })
      const csv = parser.parse(data)
      const bom = '\uFEFF'

      const filename = `${branchName}_人员名单_${formatDate(new Date())}.csv`
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(bom + csv)
    }
  )
}
