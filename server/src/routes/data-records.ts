import type { FastifyInstance } from 'fastify'
import prisma, { prisma as prismaClient } from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch } from '../middleware/auth'
import { Role, HistoryAction, Prisma, StatCycle } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'
import { isNonNegInt } from '../utils/validation'
import { convertNaming, getBranchNamingLevels } from '../utils/naming'
import * as xlsx from 'xlsx'

interface RecordInput {
  personnelId: number
  branchId: number
  sg: number
  mx: number
  qm: number
  zcDays: number
  // 可选：直接指定冠名数量（导入已含冠名列的数据时使用，跳过收光转换）
  namings?: { levelId: number; count: number }[]
}

/**
 * 校验备注字段：最大长度 100，去除首尾空白，空字符串视为 null
 */
export function normalizeRemark(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  if (s.length === 0) return null
  if (s.length > 100) return s.slice(0, 100)
  return s
}

/**
 * 解析前端传入的 weekStart 字符串（YYYY-MM-DD），返回本地时间 00:00:00 的 Date
 * 校验：必须是合法日期（不再强制校验周一，因为月统计厅前端传月初1日）
 * 未传或为空时返回 null（调用方降级到 getWeekStart()）
 */
function parseWeekStart(input: unknown): { ok: true; date: Date } | { ok: false; error: string } | null {
  if (input === undefined || input === null || input === '') return null
  if (typeof input !== 'string') {
    return { ok: false, error: 'weekStart 必须为字符串 (YYYY-MM-DD)' }
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) {
    return { ok: false, error: 'weekStart 格式必须为 YYYY-MM-DD' }
  }
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const date = new Date(y, m - 1, d)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return { ok: false, error: 'weekStart 不是有效日期' }
  }
  date.setHours(0, 0, 0, 0)
  return { ok: true, date }
}

function toNonNegInt(v: unknown): number {
  const n = Number(v)
  if (Number.isInteger(n) && n >= 0) return n
  return NaN
}

function validateRecordInput(input: Partial<RecordInput>): string | null {
  if (!input.personnelId || !input.branchId) {
    return '人员ID和分部ID不能为空'
  }
  // zcDays 未传时默认为 0
  if (input.zcDays === undefined || input.zcDays === null) input.zcDays = 0
  const fields: [string, unknown][] = [
    ['sg', input.sg],
    ['mx', input.mx],
    ['qm', input.qm],
    ['zcDays', input.zcDays],
  ]
  for (const [k, v] of fields) {
    if (!isNonNegInt(v)) {
      return `${k} 必须为非负整数`
    }
  }
  return null
}

/**
 * 校验非会长用户只能操作自己分部，返回应使用的 branchId
 * 会长未指定 branchId 时返回 null（调用方需处理）
 */
function resolveBranchId(
  currentUser: { role: Role; branchId: number | null; branchIds: number[] },
  requestedBranchId: number | undefined
): { ok: true; branchId: number | null } | { ok: false; error: string } {
  if (currentUser.role === Role.HUIZHANG) {
    if (requestedBranchId) return { ok: true, branchId: requestedBranchId }
    return { ok: true, branchId: null }
  }
  // 超管：可操作 branchIds 中的任意厅
  if (currentUser.role === Role.CHAOGUAN) {
    if (requestedBranchId && canAccessBranch(currentUser, requestedBranchId)) {
      return { ok: true, branchId: requestedBranchId }
    }
    return { ok: false, error: '只能操作授权厅数据' }
  }
  // 管理：只能操作 branchId
  if (currentUser.branchId === null) {
    return { ok: false, error: '当前账户未关联分部' }
  }
  if (requestedBranchId && requestedBranchId !== currentUser.branchId) {
    return { ok: false, error: '只能操作本分部数据' }
  }
  return { ok: true, branchId: currentUser.branchId }
}

/**
 * 校验厅是否未关闭：已关闭的厅禁止录入新数据
 * 返回 true=可录入，false=已关闭
 */
async function assertBranchOpen(branchId: number): Promise<boolean> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { closed: true },
  })
  return branch ? !branch.closed : false
}

/**
 * 同一人员同一周同一分部只能有一条记录，已存在则累加
 * 若厅为按月统计且配置了冠名等级，录入收光时按阈值整除转换为冠名，余数计入收光
 */
async function upsertRecord(
  client: Prisma.TransactionClient,
  input: RecordInput,
  createdBy: number,
  weekStart: Date,
  namingLevels: { id: number; threshold: number }[] = [],
  remark: string | null = null
) {
  // 冠名转换：对本次录入的收光进行逐级扣减转换
  // 若 input.namings 已指定（导入已含冠名列的数据），则跳过转换，直接使用传入的冠名数量
  let sgToStore = input.sg
  let namingsToApply: { levelId: number; count: number }[] = []
  if (input.namings && input.namings.length > 0) {
    namingsToApply = input.namings
  } else if (namingLevels.length > 0) {
    const converted = convertNaming(input.sg, namingLevels)
    sgToStore = converted.remainingSg
    namingsToApply = converted.namings
  }

  const existing = await client.dataRecord.findFirst({
    where: {
      personnelId: input.personnelId,
      branchId: input.branchId,
      weekStart,
    },
  })
  if (existing) {
    const updated = await client.dataRecord.update({
      where: { id: existing.id },
      data: {
        sg: existing.sg + sgToStore,
        mx: existing.mx + input.mx,
        qm: existing.qm + input.qm,
        zcDays: existing.zcDays + input.zcDays,
        // 覆盖式更新备注：最近一次录入的备注
        ...(remark !== null ? { remark } : {}),
      },
    })
    // 累加冠名数量到关联表（先查已有，分批更新/创建，避免逐条 upsert）
    if (namingsToApply.length > 0) {
      const levelIds = namingsToApply.map((n) => n.levelId)
      const existingNamings = await client.dataRecordNaming.findMany({
        where: { recordId: existing.id, levelId: { in: levelIds } },
        select: { levelId: true },
      })
      const existingLevelSet = new Set(existingNamings.map((n) => n.levelId))
      const toCreate = namingsToApply.filter((n) => !existingLevelSet.has(n.levelId))
      const toUpdate = namingsToApply.filter((n) => existingLevelSet.has(n.levelId))

      // 已存在的：累加（Prisma 不支持批量按 levelId 增量更新，仍需逐条 update）
      for (const n of toUpdate) {
        await client.dataRecordNaming.update({
          where: {
            recordId_levelId: { recordId: existing.id, levelId: n.levelId },
          },
          data: { count: { increment: n.count } },
        })
      }

      // 不存在的：批量创建
      if (toCreate.length > 0) {
        await client.dataRecordNaming.createMany({
          data: toCreate.map((n) => ({
            recordId: existing.id,
            levelId: n.levelId,
            count: n.count,
          })),
        })
      }
    }
    // 记录本次录入历史（累加场景也产生独立历史记录）
    // oldValue: 累加前汇总值, newValue: 本次增量值
    await client.dataHistory.create({
      data: {
        recordId: existing.id,
        modifierId: createdBy,
        action: HistoryAction.CREATE,
        field: null,
        oldValue: JSON.stringify({ sg: existing.sg, mx: existing.mx, qm: existing.qm, zcDays: existing.zcDays }),
        newValue: JSON.stringify({ sg: sgToStore, mx: input.mx, qm: input.qm, zcDays: input.zcDays }),
        remark,
      },
    })
    return updated
  }
  const created = await client.dataRecord.create({
    data: {
      personnelId: input.personnelId,
      branchId: input.branchId,
      weekStart,
      sg: sgToStore,
      mx: input.mx,
      qm: input.qm,
      zcDays: input.zcDays,
      createdBy,
      remark,
    },
  })
  // 新建冠名记录（批量插入）
  if (namingsToApply.length > 0) {
    await client.dataRecordNaming.createMany({
      data: namingsToApply.map((n) => ({
        recordId: created.id,
        levelId: n.levelId,
        count: n.count,
      })),
    })
  }
  // 记录本次录入历史（新建场景）
  // oldValue: null（首次录入）, newValue: 本次录入值
  await client.dataHistory.create({
    data: {
      recordId: created.id,
      modifierId: createdBy,
      action: HistoryAction.CREATE,
      field: null,
      oldValue: null,
      newValue: JSON.stringify({ sg: sgToStore, mx: input.mx, qm: input.qm, zcDays: input.zcDays }),
      remark,
    },
  })
  return created
}

/**
 * 校验人员属于指定分部，返回人员ID
 */
async function findPersonnelInBranch(name: string, branchId: number) {
  const pb = await prisma.personnelBranch.findFirst({
    where: { branchId, personnel: { name } },
    include: { personnel: true },
  })
  return pb?.personnelId ?? null
}

/**
 * 确保人员属于指定分部，不存在则自动创建并关联
 * 返回 { personnelId, created }，created 标识是否为本次新建
 */
async function ensurePersonnelInBranch(
  name: string,
  branchId: number
): Promise<{ personnelId: number; created: boolean }> {
  const existingId = await findPersonnelInBranch(name, branchId)
  if (existingId !== null) {
    return { personnelId: existingId, created: false }
  }
  // 事务内创建人员 + 分部关联
  const personnel = await prismaClient.$transaction(async (tx) => {
    // 全局查找同名人员（可能已属于其他分部）
    const existing = await tx.personnel.findFirst({ where: { name } })
    if (existing) {
      await tx.personnelBranch.create({
        data: { personnelId: existing.id, branchId },
      })
      return existing
    }
    const p = await tx.personnel.create({ data: { name } })
    await tx.personnelBranch.create({
      data: { personnelId: p.id, branchId },
    })
    return p
  })
  return { personnelId: personnel.id, created: true }
}

/**
 * 表头列索引映射
 * 支持两种格式：
 * 1. 简单格式（无表头或表头第一列为"姓名"）：姓名(0), 收光(1), 麦序(2), 全麦(3), 主持天数(4)
 * 2. 导出格式（表头含"排名"、"姓名"、"分部"等）：按表头名称定位列
 */
interface ColumnMap {
  name: number
  sg: number
  mx: number
  qm: number | null
  zcDays: number | null
  // 冠名列：header -> columnIndex（header 形如 "冠名·周冠"）
  namings: Map<string, number>
}

export function buildColumnMap(headerRow: unknown[]): ColumnMap | null {
  // 若第一列不是"姓名"或"排名"，认为无表头（简单格式）
  const firstCell = String(headerRow[0] ?? '').trim()
  if (firstCell !== '姓名' && firstCell !== '排名') return null

  // 简单格式：第一列为"姓名"
  if (firstCell === '姓名') {
    return {
      name: 0,
      sg: 1,
      mx: 2,
      qm: 3,
      zcDays: 4,
      namings: new Map(),
    }
  }

  // 导出格式：按表头名称定位
  const map: ColumnMap = {
    name: -1,
    sg: -1,
    mx: -1,
    qm: null,
    zcDays: null,
    namings: new Map(),
  }
  headerRow.forEach((cell, idx) => {
    const h = String(cell ?? '').trim()
    if (h === '姓名') map.name = idx
    else if (h === '收光') map.sg = idx
    else if (h === '麦序') map.mx = idx
    else if (h === '全麦') map.qm = idx
    else if (h === '主持天数') map.zcDays = idx
    else if (h.startsWith('冠名·')) map.namings.set(h, idx)
  })
  // 必须至少找到姓名和收光列
  if (map.name === -1 || map.sg === -1) return null
  return map
}

/**
 * 从行数据中按列索引提取值，缺失或空值返回 0
 */
function getCell(row: unknown[], idx: number | null): number {
  if (idx === null || idx === -1) return 0
  const v = row[idx]
  if (v === undefined || v === '' || v === null) return 0
  return toNonNegInt(v)
}

export default async function dataRecordRoutes(fastify: FastifyInstance) {
  // POST /api/data-records - 手动录入（单条和批量）
  fastify.post(
    '/api/data-records',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as Record<string, unknown>
      // 解析前端传入的 weekStart（YYYY-MM-DD），未传则降级到服务器当前周
      // 修复：原来硬编码 getWeekStart()，导致 Docker UTC 时区下周一凌晨录入数据进入上周
      // 同时支持编辑历史周数据（前端传入用户查看的周）
      const parsedWeekStart = parseWeekStart(body.weekStart)
      if (parsedWeekStart && !parsedWeekStart.ok) {
        return reply.code(400).send({ error: parsedWeekStart.error })
      }
      const weekStart = parsedWeekStart && parsedWeekStart.ok ? parsedWeekStart.date : getWeekStart()
      // 备注字段：批量录入共用一个备注，写入每条记录
      const remark = normalizeRemark(body.remark)

      // 批量录入
      if (Array.isArray(body.records)) {
        const inputs = body.records as Partial<RecordInput>[]
        if (inputs.length === 0) {
          return reply.code(400).send({ error: '记录列表不能为空' })
        }

        // 先统一校验
        for (let i = 0; i < inputs.length; i++) {
          const err = validateRecordInput(inputs[i])
          if (err) {
            return reply.code(400).send({ error: `第${i + 1}条记录：${err}` })
          }
        }

        // 第一遍：解析 branchId 并校验权限（不涉及 DB 查询）
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as RecordInput
          const resolved = resolveBranchId(currentUser, input.branchId)
          if (!resolved.ok) {
            return reply.code(403).send({ error: `第${i + 1}条记录：${resolved.error}` })
          }
          if (resolved.branchId === null) {
            return reply.code(400).send({ error: `第${i + 1}条记录：请指定分部` })
          }
          input.branchId = resolved.branchId
        }

        // 预先一次性查询所有人员-分部关联关系和分部信息，避免 N+1 查询
        const uniquePersonnelIds = Array.from(
          new Set(inputs.map((i) => (i as RecordInput).personnelId))
        )
        const uniqueBranchIds = Array.from(
          new Set(inputs.map((i) => (i as RecordInput).branchId))
        )

        const [associations, branchesInfo] = await Promise.all([
          prisma.personnelBranch.findMany({
            where: {
              personnelId: { in: uniquePersonnelIds },
              branchId: { in: uniqueBranchIds },
            },
            select: { personnelId: true, branchId: true },
          }),
          prisma.branch.findMany({
            where: { id: { in: uniqueBranchIds } },
            select: { id: true, closed: true, statCycle: true },
          }),
        ])
        const assocSet = new Set(
          associations.map((a) => `${a.personnelId}_${a.branchId}`)
        )
        const branchInfoMap = new Map(branchesInfo.map((b) => [b.id, b]))

        // 第二遍：使用预取数据校验，并构建各厅冠名等级缓存
        const branchLevelsMap = new Map<number, { id: number; threshold: number }[]>()
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as RecordInput

          // 校验厅未关闭（使用预取数据）
          const branchInfo = branchInfoMap.get(input.branchId)
          if (!branchInfo || branchInfo.closed) {
            return reply
              .code(403)
              .send({ error: `第${i + 1}条记录：该厅已关闭，无法录入数据` })
          }

          // 校验人员属于该分部（使用预取 Set）
          if (!assocSet.has(`${input.personnelId}_${input.branchId}`)) {
            return reply
              .code(400)
              .send({ error: `第${i + 1}条记录：人员不属于该分部` })
          }

          // 缓存各厅冠名等级（仅按月统计厅，每厅仅查询一次）
          if (!branchLevelsMap.has(input.branchId)) {
            if (branchInfo.statCycle === StatCycle.MONTH) {
              branchLevelsMap.set(
                input.branchId,
                await getBranchNamingLevels(input.branchId)
              )
            } else {
              branchLevelsMap.set(input.branchId, [])
            }
          }
        }

        const created = await prismaClient.$transaction(async (tx) => {
          const results = []
          for (const input of inputs as RecordInput[]) {
            const levels = branchLevelsMap.get(input.branchId) ?? []
            const rec = await upsertRecord(tx, input, currentUser.id, weekStart, levels, remark)
            results.push(rec)
          }
          return results
        })

        return reply.code(201).send(created)
      }

      // 单条录入
      const input = body as Partial<RecordInput>
      const err = validateRecordInput(input)
      if (err) {
        return reply.code(400).send({ error: err })
      }

      const resolved = resolveBranchId(currentUser, input.branchId)
      if (!resolved.ok) {
        return reply.code(403).send({ error: resolved.error })
      }
      if (resolved.branchId === null) {
        return reply.code(400).send({ error: '请指定分部' })
      }
      input.branchId = resolved.branchId

      // 校验厅未关闭
      if (!(await assertBranchOpen(input.branchId))) {
        return reply.code(403).send({ error: '该厅已关闭，无法录入数据' })
      }

      const assoc = await prisma.personnelBranch.findUnique({
        where: {
          personnelId_branchId: {
            personnelId: input.personnelId!,
            branchId: input.branchId,
          },
        },
      })
      if (!assoc) {
        return reply.code(400).send({ error: '人员不属于该分部' })
      }

      // 获取冠名等级（仅按月统计厅）
      const branch = await prisma.branch.findUnique({
        where: { id: input.branchId },
        select: { statCycle: true },
      })
      const namingLevels = branch?.statCycle === StatCycle.MONTH
        ? await getBranchNamingLevels(input.branchId)
        : []

      const record = await upsertRecord(
        prismaClient as unknown as Prisma.TransactionClient,
        input as RecordInput,
        currentUser.id,
        weekStart,
        namingLevels,
        remark
      )
      return reply.code(201).send(record)
    }
  )

  // POST /api/data-records/import-excel - Excel导入
  fastify.post(
    '/api/data-records/import-excel',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const currentUser = request.user

      // 遍历所有部分，收集文件与 branchId 字段
      let fileBuffer: Buffer | null = null
      let requestedBranchId: number | undefined
      let requestedWeekStart: string | undefined
      let requestedRemark: string | undefined
      const parts = request.parts()
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            fileBuffer = await part.toBuffer()
          }
        } else if (part.type === 'field') {
          if (part.fieldname === 'branchId') {
            requestedBranchId = Number(part.value)
          } else if (part.fieldname === 'weekStart') {
            requestedWeekStart = String(part.value)
          } else if (part.fieldname === 'remark') {
            requestedRemark = String(part.value)
          }
        }
      }

      if (!fileBuffer) {
        return reply.code(400).send({ error: '未上传文件' })
      }

      const resolved = resolveBranchId(currentUser, requestedBranchId)
      if (!resolved.ok) {
        return reply.code(403).send({ error: resolved.error })
      }
      const branchId = resolved.branchId
      if (branchId === null) {
        return reply.code(400).send({ error: '请指定分部' })
      }

      // 校验厅未关闭
      if (!(await assertBranchOpen(branchId))) {
        return reply.code(403).send({ error: '该厅已关闭，无法录入数据' })
      }

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) {
        return reply.code(400).send({ error: 'Excel文件无有效工作表' })
      }
      const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
      })

      // 解析前端传入的 weekStart（修复时区 bug + 支持编辑历史周）
      const parsedWeekStartExcel = parseWeekStart(requestedWeekStart)
      if (parsedWeekStartExcel && !parsedWeekStartExcel.ok) {
        return reply.code(400).send({ error: parsedWeekStartExcel.error })
      }
      const weekStart = parsedWeekStartExcel && parsedWeekStartExcel.ok ? parsedWeekStartExcel.date : getWeekStart()
      const remark = normalizeRemark(requestedRemark)
      let success = 0
      let failed = 0
      const failures: { row: number; name: string; reason: string }[] = []
      const createdPersons: string[] = []

      // 获取冠名等级（仅按月统计厅）
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { statCycle: true },
      })
      const namingLevels = branch?.statCycle === StatCycle.MONTH
        ? await getBranchNamingLevels(branchId)
        : []

      // 解析表头，构建列索引映射（支持导出格式和简单格式）
      const headerRow = rows[0] as unknown[]
      const colMap = buildColumnMap(headerRow)

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        const name = colMap
          ? String(row[colMap.name] ?? '').trim()
          : String(row[0] ?? '').trim()
        if (!name) continue

        let sg: number, mx: number, qm: number, zcDays: number
        let inputNamings: { levelId: number; count: number }[] | undefined

        if (colMap) {
          // 导出格式：按表头列索引提取
          sg = getCell(row, colMap.sg)
          mx = getCell(row, colMap.mx)
          qm = getCell(row, colMap.qm)
          zcDays = getCell(row, colMap.zcDays)
          // 冠名列：按等级名匹配 levelId
          if (colMap.namings.size > 0 && namingLevels.length > 0) {
            inputNamings = []
            for (const [header, idx] of colMap.namings) {
              // header 形如 "冠名·周冠"，提取等级名 "周冠"
              const levelName = header.replace(/^冠名·/, '')
              const level = namingLevels.find((l) => l.name === levelName)
              if (level) {
                const count = getCell(row, idx)
                if (count > 0) inputNamings.push({ levelId: level.id, count })
              }
            }
            if (inputNamings.length === 0) inputNamings = undefined
          }
        } else {
          // 简单格式：姓名(0), 收光(1), 麦序(2), 全麦(3), 主持天数(4)
          sg = row[1] === undefined || row[1] === '' ? 0 : toNonNegInt(row[1])
          mx = row[2] === undefined || row[2] === '' ? 0 : toNonNegInt(row[2])
          qm = row[3] === undefined || row[3] === '' ? 0 : toNonNegInt(row[3])
          zcDays = row[4] === undefined || row[4] === '' ? 0 : toNonNegInt(row[4])
        }

        if (Number.isNaN(sg) || Number.isNaN(mx) || Number.isNaN(qm) || Number.isNaN(zcDays)) {
          failed++
          failures.push({ row: i + 1, name, reason: '收光/麦序/全麦/主持天数必须为非负整数' })
          continue
        }

        // 人员不存在则自动创建并关联到当前厅
        let personnelId: number
        try {
          const result = await ensurePersonnelInBranch(name, branchId)
          personnelId = result.personnelId
          if (result.created) createdPersons.push(name)
        } catch {
          failed++
          failures.push({ row: i + 1, name, reason: '人员创建失败' })
          continue
        }

        try {
          await upsertRecord(
            prismaClient as unknown as Prisma.TransactionClient,
            { personnelId, branchId, sg, mx, qm, zcDays, namings: inputNamings },
            currentUser.id,
            weekStart,
            namingLevels,
            remark
          )
          success++
        } catch {
          failed++
          failures.push({ row: i + 1, name, reason: '录入失败' })
        }
      }

      return reply.send({ success, failed, failures, createdPersons })
    }
  )

  // POST /api/data-records/import-paste - 表格粘贴导入
  fastify.post(
    '/api/data-records/import-paste',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const currentUser = request.user
      const { data, branchId: requestedBranchId, weekStart: requestedWeekStart, remark: requestedRemark } = request.body as {
        data: string
        branchId?: number
        weekStart?: string
        remark?: string
      }

      if (!data) {
        return reply.code(400).send({ error: '数据不能为空' })
      }

      const resolved = resolveBranchId(currentUser, requestedBranchId)
      if (!resolved.ok) {
        return reply.code(403).send({ error: resolved.error })
      }
      const branchId = resolved.branchId
      if (branchId === null) {
        return reply.code(400).send({ error: '请指定分部' })
      }

      // 校验厅未关闭
      if (!(await assertBranchOpen(branchId))) {
        return reply.code(403).send({ error: '该厅已关闭，无法录入数据' })
      }

      // 解析前端传入的 weekStart（修复时区 bug + 支持编辑历史周）
      const parsedWeekStartPaste = parseWeekStart(requestedWeekStart)
      if (parsedWeekStartPaste && !parsedWeekStartPaste.ok) {
        return reply.code(400).send({ error: parsedWeekStartPaste.error })
      }
      const weekStart = parsedWeekStartPaste && parsedWeekStartPaste.ok ? parsedWeekStartPaste.date : getWeekStart()
      const remark = normalizeRemark(requestedRemark)
      let success = 0
      let failed = 0
      const failures: { row: number; name: string; reason: string }[] = []
      const createdPersons: string[] = []

      // 获取冠名等级（仅按月统计厅）
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { statCycle: true },
      })
      const namingLevels = branch?.statCycle === StatCycle.MONTH
        ? await getBranchNamingLevels(branchId)
        : []

      const lines = data
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      // 解析表头，构建列索引映射（支持导出格式和简单格式）
      const delimiter = lines[0]?.includes('\t') ? '\t' : ','
      const headerParts = lines[0].split(delimiter)
      const colMap = buildColumnMap(headerParts)
      const startIdx = colMap ? 1 : 0

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i]
        const parts = line.split(delimiter)

        const name = colMap
          ? String(parts[colMap.name] ?? '').trim()
          : (parts[0] ?? '').trim()
        if (!name) continue

        let sg: number, mx: number, qm: number, zcDays: number
        let inputNamings: { levelId: number; count: number }[] | undefined

        if (colMap) {
          sg = colMap.sg >= 0 && parts[colMap.sg] ? toNonNegInt(parts[colMap.sg].trim()) : 0
          mx = colMap.mx >= 0 && parts[colMap.mx] ? toNonNegInt(parts[colMap.mx].trim()) : 0
          qm = colMap.qm !== null && colMap.qm >= 0 && parts[colMap.qm] ? toNonNegInt(parts[colMap.qm].trim()) : 0
          zcDays = colMap.zcDays !== null && colMap.zcDays >= 0 && parts[colMap.zcDays] ? toNonNegInt(parts[colMap.zcDays].trim()) : 0
          // 冠名列
          if (colMap.namings.size > 0 && namingLevels.length > 0) {
            inputNamings = []
            for (const [header, idx] of colMap.namings) {
              const levelName = header.replace(/^冠名·/, '')
              const level = namingLevels.find((l) => l.name === levelName)
              if (level && parts[idx]) {
                const count = toNonNegInt(parts[idx].trim())
                if (count > 0) inputNamings.push({ levelId: level.id, count })
              }
            }
            if (inputNamings.length === 0) inputNamings = undefined
          }
        } else {
          // 简单格式
          sg = parts[1] === undefined || parts[1].trim() === '' ? 0 : toNonNegInt(parts[1])
          mx = parts[2] === undefined || parts[2].trim() === '' ? 0 : toNonNegInt(parts[2])
          qm = parts[3] === undefined || parts[3].trim() === '' ? 0 : toNonNegInt(parts[3])
          zcDays = parts[4] === undefined || parts[4].trim() === '' ? 0 : toNonNegInt(parts[4])
        }

        if (Number.isNaN(sg) || Number.isNaN(mx) || Number.isNaN(qm) || Number.isNaN(zcDays)) {
          failed++
          failures.push({ row: i + 1, name, reason: '收光/麦序/全麦/主持天数必须为非负整数' })
          continue
        }

        // 人员不存在则自动创建并关联到当前厅
        let personnelId: number
        try {
          const result = await ensurePersonnelInBranch(name, branchId)
          personnelId = result.personnelId
          if (result.created) createdPersons.push(name)
        } catch {
          failed++
          failures.push({ row: i + 1, name, reason: '人员创建失败' })
          continue
        }

        try {
          await upsertRecord(
            prismaClient as unknown as Prisma.TransactionClient,
            { personnelId, branchId, sg, mx, qm, zcDays, namings: inputNamings },
            currentUser.id,
            weekStart,
            namingLevels,
            remark
          )
          success++
        } catch {
          failed++
          failures.push({ row: i + 1, name, reason: '录入失败' })
        }
      }

      return reply.send({ success, failed, failures, createdPersons })
    }
  )

  // PUT /api/data-records/:id - 修改数据
  fastify.put(
    '/api/data-records/:id',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user
      const body = request.body as {
        sg?: number
        mx?: number
        qm?: number
        zcDays?: number
        personnelId?: number
        namings?: { levelId: number; count: number }[]
        remark?: string
      }
      const remark = normalizeRemark(body.remark)

      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const record = await prisma.dataRecord.findUnique({
        where: { id: recordId },
      })
      if (!record) {
        return reply.code(404).send({ error: '记录不存在' })
      }

      // 非会长只能修改本分部/授权厅数据
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, record.branchId)) {
          return reply.code(403).send({ error: '只能修改授权厅数据' })
        }
      } else if (currentUser.role !== Role.HUIZHANG) {
        if (
          currentUser.branchId === null ||
          record.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能修改本分部数据' })
        }
      }

      // 校验 sg/mx/qm/zcDays 字段合法性（仅记录值实际发生变化的字段）
      const updates: { field: 'sg' | 'mx' | 'qm' | 'zcDays'; value: number }[] = []
      for (const field of ['sg', 'mx', 'qm', 'zcDays'] as const) {
        if (body[field] !== undefined) {
          if (!isNonNegInt(body[field])) {
            return reply.code(400).send({ error: `${field} 必须为非负整数` })
          }
          // 仅当值与原值不同时才记为更新（值未变化不参与保存判定）
          if (body[field] !== record[field]) {
            updates.push({ field, value: body[field] as number })
          }
        }
      }

      // 校验 personnelId
      const personnelChanged =
        body.personnelId !== undefined &&
        body.personnelId !== record.personnelId
      if (body.personnelId !== undefined && !Number.isInteger(body.personnelId)) {
        return reply.code(400).send({ error: '人员ID必须为整数' })
      }
      if (personnelChanged) {
        // 校验新人员属于该分部
        const assoc = await prisma.personnelBranch.findUnique({
          where: {
            personnelId_branchId: {
              personnelId: body.personnelId!,
              branchId: record.branchId,
            },
          },
        })
        if (!assoc) {
          return reply.code(400).send({ error: '人员不属于该分部' })
        }
      }

      // 校验 namings（覆盖语义：传入即覆盖该记录的所有冠名数量）
      // 仅当传入的冠名数据与当前数据库存储不同时才标记为需要更新
      let namingsToUpdate: { levelId: number; count: number }[] | null = null
      if (body.namings !== undefined) {
        if (!Array.isArray(body.namings)) {
          return reply.code(400).send({ error: 'namings 必须为数组' })
        }
        for (const n of body.namings) {
          if (
            !n ||
            typeof n.levelId !== 'number' ||
            typeof n.count !== 'number' ||
            !Number.isInteger(n.levelId) ||
            !Number.isInteger(n.count) ||
            n.count < 0
          ) {
            return reply
              .code(400)
              .send({ error: '冠名 levelId/count 必须为非负整数' })
          }
        }
        // 校验 levelId 均属于该厅的冠名等级
        const branchLevels = await prisma.namingLevel.findMany({
          where: { branchId: record.branchId },
          select: { id: true },
        })
        const validLevelIds = new Set(branchLevels.map((l) => l.id))
        for (const n of body.namings) {
          if (!validLevelIds.has(n.levelId)) {
            return reply
              .code(400)
              .send({ error: `冠名等级 ${n.levelId} 不属于该厅` })
          }
        }
        // 仅保留 count > 0 的项
        const filteredNamings = body.namings.filter((n) => n.count > 0)
        // 查询当前数据库中该记录的冠名数据，对比是否实际发生变化
        const currentNamings = await prisma.dataRecordNaming.findMany({
          where: { recordId: record.id },
          select: { levelId: true, count: true },
        })
        const currentMap = new Map(currentNamings.map((n) => [n.levelId, n.count]))
        const newMap = new Map(filteredNamings.map((n) => [n.levelId, n.count]))
        // 对比 keys 和 values 是否完全一致
        let namingsChanged = currentMap.size !== newMap.size
        if (!namingsChanged) {
          for (const [levelId, count] of newMap) {
            if (currentMap.get(levelId) !== count) {
              namingsChanged = true
              break
            }
          }
        }
        // 仅在实际发生变化时才标记为需要更新
        if (namingsChanged) {
          namingsToUpdate = filteredNamings
        }
      }

      // 数据无变化时阻止保存（即使备注变化，也必须有数值变化才能保存）
      if (updates.length === 0 && !personnelChanged && namingsToUpdate === null) {
        return reply.code(400).send({ error: '数据无变化，无需保存' })
      }

      // 备注是否变化（仅在数值有变化时才覆盖更新备注）
      const originalRemark = record.remark ?? ''
      const newRemark = remark ?? ''
      const remarkChanged = newRemark !== originalRemark

      // 记录修改历史并更新
      const updated = await prismaClient.$transaction(async (tx) => {
        // 聚合记录本次修改历史：单条记录包含所有字段变更前后值
        // oldValue: 变更前全量值, newValue: 变更后全量值
        const beforeValues = {
          sg: record.sg,
          mx: record.mx,
          qm: record.qm,
          zcDays: record.zcDays,
        }
        const afterValues = {
          sg: body.sg ?? record.sg,
          mx: body.mx ?? record.mx,
          qm: body.qm ?? record.qm,
          zcDays: body.zcDays ?? record.zcDays,
        }
        // 检查是否有数值变化或人员变更
        const hasValueChange =
          beforeValues.sg !== afterValues.sg ||
          beforeValues.mx !== afterValues.mx ||
          beforeValues.qm !== afterValues.qm ||
          beforeValues.zcDays !== afterValues.zcDays ||
          personnelChanged
        if (hasValueChange) {
          await tx.dataHistory.create({
            data: {
              recordId: record.id,
              modifierId: currentUser.id,
              action: HistoryAction.UPDATE,
              field: personnelChanged ? 'personnelId' : null,
              oldValue: JSON.stringify({
                ...beforeValues,
                ...(personnelChanged ? { personnelId: record.personnelId } : {}),
              }),
              newValue: JSON.stringify({
                ...afterValues,
                ...(personnelChanged ? { personnelId: body.personnelId } : {}),
              }),
              remark,
            },
          })
        }

        // 先在当前记录上应用 namings 覆盖（删除原有冠名，写入新的）
        // 后续若发生人员变更合并，会把这些 namings 累加到目标记录
        if (namingsToUpdate !== null) {
          await tx.dataRecordNaming.deleteMany({ where: { recordId: record.id } })
          if (namingsToUpdate.length > 0) {
            await tx.dataRecordNaming.createMany({
              data: namingsToUpdate.map((n) => ({
                recordId: record.id,
                levelId: n.levelId,
                count: n.count,
              })),
            })
          }
        }

        // 人员变更：合并到目标人员本周记录
        if (personnelChanged) {
          const newPersonnelId = body.personnelId!

          const target = await tx.dataRecord.findFirst({
            where: {
              personnelId: newPersonnelId,
              branchId: record.branchId,
              weekStart: record.weekStart,
            },
          })

          // 计算新值（应用本次 sg/mx/qm/zcDays 更新）
          const newSg = body.sg ?? record.sg
          const newMx = body.mx ?? record.mx
          const newQm = body.qm ?? record.qm
          const newZcDays = body.zcDays ?? record.zcDays

          // 获取当前记录最新的冠名（已覆盖更新或保留原有）
          const currentNamings =
            namingsToUpdate !== null
              ? namingsToUpdate
              : await tx.dataRecordNaming.findMany({
                  where: { recordId: record.id },
                  select: { levelId: true, count: true },
                })

          if (target) {
            // 目标人员本周已有记录：累加并删除当前记录
            const merged = await tx.dataRecord.update({
              where: { id: target.id },
              data: {
                sg: target.sg + newSg,
                mx: target.mx + newMx,
                qm: target.qm + newQm,
                zcDays: target.zcDays + newZcDays,
                // 覆盖式更新备注
                ...(remarkChanged ? { remark } : {}),
              },
            })
            // 冠名数量累加到目标记录
            for (const n of currentNamings) {
              await tx.dataRecordNaming.upsert({
                where: {
                  recordId_levelId: { recordId: target.id, levelId: n.levelId },
                },
                update: { count: { increment: n.count } },
                create: { recordId: target.id, levelId: n.levelId, count: n.count },
              })
            }
            await tx.dataRecord.delete({ where: { id: record.id } })
            return merged
          } else {
            // 目标人员本周无记录：直接更新当前记录的 personnelId（namings 已更新）
            return tx.dataRecord.update({
              where: { id: record.id },
              data: {
                personnelId: newPersonnelId,
                sg: body.sg ?? undefined,
                mx: body.mx ?? undefined,
                qm: body.qm ?? undefined,
                zcDays: body.zcDays ?? undefined,
                // 覆盖式更新备注
                ...(remarkChanged ? { remark } : {}),
              },
            })
          }
        }

        return tx.dataRecord.update({
          where: { id: record.id },
          data: {
            sg: body.sg ?? undefined,
            mx: body.mx ?? undefined,
            qm: body.qm ?? undefined,
            zcDays: body.zcDays ?? undefined,
            // 覆盖式更新备注
            ...(remarkChanged ? { remark } : {}),
          },
        })
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/data-records/:id - 删除数据
  fastify.delete(
    '/api/data-records/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG, Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user
      const body = request.body as { remark?: string } | null
      const remark = normalizeRemark(body?.remark)

      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const record = await prisma.dataRecord.findUnique({
        where: { id: recordId },
      })
      if (!record) {
        return reply.code(404).send({ error: '记录不存在' })
      }

      // 超管只能删除授权厅数据（会长不限）
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, record.branchId)) {
          return reply.code(403).send({ error: '只能删除授权厅数据' })
        }
      }

      // 记录删除操作到历史，然后删除记录
      await prismaClient.$transaction(async (tx) => {
        await tx.dataHistory.create({
          data: {
            recordId: record.id,
            modifierId: currentUser.id,
            action: HistoryAction.DELETE,
            field: null,
            oldValue: JSON.stringify({
              personnelId: record.personnelId,
              branchId: record.branchId,
              weekStart: record.weekStart,
              sg: record.sg,
              mx: record.mx,
              qm: record.qm,
              zcDays: record.zcDays,
            }),
            newValue: null,
            remark,
          },
        })
        await tx.dataRecord.delete({ where: { id: record.id } })
      })

      return reply.send({ message: '记录已删除' })
    }
  )

  // GET /api/data-records/:id/history - 查询修改历史
  fastify.get(
    '/api/data-records/:id/history',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user

      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const record = await prisma.dataRecord.findUnique({
        where: { id: recordId },
      })
      if (!record) {
        return reply.code(404).send({ error: '记录不存在' })
      }

      // 非会长只能查看本分部/授权厅数据
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, record.branchId)) {
          return reply.code(403).send({ error: '只能查看授权厅数据' })
        }
      } else if (currentUser.role !== Role.HUIZHANG) {
        if (
          currentUser.branchId === null ||
          record.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能查看本分部数据' })
        }
      }

      const histories = await prisma.dataHistory.findMany({
        where: { recordId },
        include: {
          modifier: { select: { id: true, username: true } },
        },
        orderBy: { modifyTime: 'desc' },
      })

      return reply.send(histories)
    }
  )
}
