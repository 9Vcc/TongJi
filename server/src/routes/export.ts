import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'
import { computeRanking, resolveQueryBranchId } from '../utils/welfare'
import prisma from '../lib/prisma'
import * as xlsx from 'xlsx'

// json2csv 无 TypeScript 类型定义
const Json2CSVParser = require('json2csv').Parser

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 解析导出周期参数：MONTH=按月，其他默认按周
 */
function resolveCycleParam(cycleParam: string | undefined): StatCycle {
  return cycleParam === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
}

export default async function exportRoutes(fastify: FastifyInstance) {
  // GET /api/export/excel - 导出Excel（支持按周/按月，仅超管及以上可访问）
  // 有冠名数据的厅：导出包含冠名列（按等级动态生成）和冠名福利列
  fastify.get(
    '/api/export/excel',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const cycle = resolveCycleParam(cycleParam)
      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)
      const ranking = await computeRanking(refDate, branchFilter, cycle)

      // 查询该厅奖励规则，判断全麦转换是否开启
      // 未开启全麦转换的厅：导出列表不包含全麦列
      const rewardRule = branchFilter
        ? await prisma.rewardRule.findFirst({
            where: { branchId: branchFilter },
            include: { branch: { select: { name: true } } },
          })
        : null
      const qmEnabled = rewardRule?.qmEnabled ?? true
      const zcEnabled = rewardRule?.zcEnabled ?? false
      // 厅名用于导出文件名
      const branchName = rewardRule?.branch?.name ?? ranking[0]?.branchName ?? '全部厅'

      // 收集所有出现过的冠名等级（保持顺序，按 levelId 升序）
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
        row['排名奖励'] = r.rankReward
        // 动态添加冠名列：每等级一列，值为该人员该等级的 count
        if (hasNaming) {
          const namingMap = new Map<number, number>()
          for (const n of r.namings ?? []) {
            namingMap.set(n.levelId, n.count)
          }
          for (const [levelId, levelName] of namingLevels) {
            row[`冠名·${levelName}`] = namingMap.get(levelId) ?? 0
          }
          row['冠名福利'] = r.namingWelfare
        }
        row['扣减'] = r.deduction
        row['总福利'] = r.totalWelfare
        return row
      })

      const sheetName = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const prefix = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const worksheet = xlsx.utils.json_to_sheet(data)
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName)
      const buffer = xlsx.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      })

      const filename = `${branchName}_${prefix}_${formatDate(refDate)}.xlsx`
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
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const cycle = resolveCycleParam(cycleParam)
      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)
      const ranking = await computeRanking(refDate, branchFilter, cycle)

      // 查询该厅奖励规则，判断全麦转换是否开启
      // 未开启全麦转换的厅：导出列表不包含全麦列
      const rewardRule = branchFilter
        ? await prisma.rewardRule.findFirst({
            where: { branchId: branchFilter },
            include: { branch: { select: { name: true } } },
          })
        : null
      const qmEnabled = rewardRule?.qmEnabled ?? true
      const zcEnabled = rewardRule?.zcEnabled ?? false
      // 厅名用于导出文件名
      const branchName = rewardRule?.branch?.name ?? ranking[0]?.branchName ?? '全部厅'

      // 收集所有出现过的冠名等级
      const namingLevels = new Map<number, string>()
      for (const r of ranking) {
        for (const n of r.namings ?? []) {
          if (!namingLevels.has(n.levelId)) {
            namingLevels.set(n.levelId, n.levelName)
          }
        }
      }
      const hasNaming = namingLevels.size > 0

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
      fields.push({ label: '排名奖励', value: 'rankReward' })
      if (hasNaming) {
        for (const [, levelName] of namingLevels) {
          fields.push({ label: `冠名·${levelName}`, value: `naming_${levelName}` })
        }
        fields.push({ label: '冠名福利', value: 'namingWelfare' })
      }
      fields.push({ label: '扣减', value: 'deduction' })
      fields.push({ label: '总福利', value: 'totalWelfare' })

      // 将 ranking 展平为 CSV 用的行数据：动态冠名等级映射为 naming_<levelName> 字段
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
        row['rankReward'] = r.rankReward
        if (hasNaming) {
          const namingMap = new Map<number, number>()
          for (const n of r.namings ?? []) {
            namingMap.set(n.levelId, n.count)
          }
          for (const [levelId, levelName] of namingLevels) {
            row[`naming_${levelName}`] = namingMap.get(levelId) ?? 0
          }
          row['namingWelfare'] = r.namingWelfare
        }
        row['deduction'] = r.deduction
        row['totalWelfare'] = r.totalWelfare
        return row
      })

      const parser = new Json2CSVParser({ fields })
      const csv = parser.parse(flatRanking)

      // 添加 BOM 以便 Excel 正确识别 UTF-8 编码
      const bom = '\uFEFF'
      const prefix = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const filename = `${branchName}_${prefix}_${formatDate(refDate)}.csv`
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(bom + csv)
    }
  )
}
