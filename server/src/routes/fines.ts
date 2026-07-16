import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'
import { isNonNegInt } from '../utils/validation'
import * as xlsx from 'xlsx'

// json2csv 无 TypeScript 类型定义
const Json2CSVParser = require('json2csv').Parser

// 罚款原因分类
const REASON_TYPES = ['LATE', 'VIOLATION', 'OTHER'] as const
type ReasonType = (typeof REASON_TYPES)[number]

function isValidReasonType(v: string): v is ReasonType {
  return (REASON_TYPES as readonly string[]).includes(v)
}

// 解析 YYYY-MM 格式月份，返回 [月初 00:00, 下月1日 00:00) 范围
// 无效或未提供时返回 null
function parseMonthRange(month?: string): { gte: Date; lt: Date } | null {
  if (!month) return null
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2]) - 1 // 0-based
  if (mon < 0 || mon > 11) return null
  const gte = new Date(year, mon, 1, 0, 0, 0, 0)
  const lt = new Date(year, mon + 1, 1, 0, 0, 0, 0)
  return { gte, lt }
}

// 格式化月份为中文：2026-06 → "2026年6月"
function formatMonthCN(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return month
  return `${Number(m[1])}年${Number(m[2])}月`
}

export default async function fineRoutes(fastify: FastifyInstance) {
  // ============ 罚款人员管理 ============

  // GET /api/fines/personnel - 查询所有罚款人员
  fastify.get(
    '/api/fines/personnel',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const personnel = await prisma.finePersonnel.findMany({
        include: {
          _count: { select: { fines: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return reply.send(personnel)
    }
  )

  // POST /api/fines/personnel - 新增罚款人员
  fastify.post(
    '/api/fines/personnel',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const body = request.body as { name?: string }
      const name = body.name?.trim()
      if (!name) {
        return reply.code(400).send({ error: '姓名不能为空' })
      }
      if (name.length > 50) {
        return reply.code(400).send({ error: '姓名不能超过50字' })
      }

      const personnel = await prisma.finePersonnel.create({
        data: { name },
      })
      return reply.send(personnel)
    }
  )

  // PUT /api/fines/personnel/:id - 重命名罚款人员
  fastify.put(
    '/api/fines/personnel/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id: idParam } = request.params as { id: string }
      const id = Number(idParam)
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: '无效的人员 ID' })
      }

      const body = request.body as { name?: string }
      const name = body.name?.trim()
      if (!name) {
        return reply.code(400).send({ error: '姓名不能为空' })
      }
      if (name.length > 50) {
        return reply.code(400).send({ error: '姓名不能超过50字' })
      }

      const personnel = await prisma.finePersonnel.update({
        where: { id },
        data: { name },
      })
      return reply.send(personnel)
    }
  )

  // DELETE /api/fines/personnel/:id - 删除罚款人员（级联删除其罚款记录）
  fastify.delete(
    '/api/fines/personnel/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id: idParam } = request.params as { id: string }
      const id = Number(idParam)
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: '无效的人员 ID' })
      }

      await prisma.finePersonnel.delete({ where: { id } })
      return reply.send({ message: '已删除' })
    }
  )

  // POST /api/fines/personnel/batch - 批量导入罚款人员
  // 入参：{ names: string[] }，按行分隔的姓名数组
  fastify.post(
    '/api/fines/personnel/batch',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const body = request.body as { names?: string[] }
      const names = Array.isArray(body.names) ? body.names : []

      // 规范化：trim、去空行、限 50 字
      const normalized = names
        .map((n) => (typeof n === 'string' ? n.trim() : ''))
        .filter((n) => n.length > 0)
        .map((n) => (n.length > 50 ? n.slice(0, 50) : n))

      // 去重（保留首次出现的）
      const uniqueNames: string[] = []
      const seen = new Set<string>()
      for (const n of normalized) {
        if (!seen.has(n)) {
          seen.add(n)
          uniqueNames.push(n)
        }
      }

      if (uniqueNames.length === 0) {
        return reply.code(400).send({ error: '未提供有效姓名' })
      }

      // 查询已存在的人员姓名（用于跳过重复）
      const existing = await prisma.finePersonnel.findMany({
        where: { name: { in: uniqueNames } },
        select: { name: true },
      })
      const existingNames = new Set(existing.map((e) => e.name))

      const toCreate = uniqueNames.filter((n) => !existingNames.has(n))
      const skipped = uniqueNames.filter((n) => existingNames.has(n))

      // 逐条创建（避免 createMany 在部分失败时整体回滚）
      const created: { id: number; name: string }[] = []
      for (const name of toCreate) {
        try {
          const p = await prisma.finePersonnel.create({ data: { name } })
          created.push({ id: p.id, name: p.name })
        } catch {
          // 单条失败跳过，不中断
        }
      }

      return reply.send({
        created: created.length,
        skipped: skipped.length,
        total: uniqueNames.length,
        createdNames: created.map((c) => c.name),
        skippedNames: skipped,
      })
    }
  )

  // ============ 罚款记录管理 ============

  // GET /api/fines/months - 查询所有罚款记录涉及到的月份列表（YYYY-MM）
  // 返回降序排列的月份字符串数组，始终包含当前月
  fastify.get(
    '/api/fines/months',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (_request, reply) => {
      const fines = await prisma.fine.findMany({
        select: { fineDate: true },
      })
      const monthSet = new Set<string>()
      for (const f of fines) {
        const key = `${f.fineDate.getFullYear()}-${String(f.fineDate.getMonth() + 1).padStart(2, '0')}`
        monthSet.add(key)
      }
      // 始终包含当前月
      const now = new Date()
      monthSet.add(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      )
      const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a))
      return reply.send(months)
    }
  )

  // GET /api/fines - 查询罚款记录列表
  // 查询参数：month（YYYY-MM，可选，优先于 startDate/endDate）、startDate, endDate, personnelId, reasonType（均可选）
  fastify.get(
    '/api/fines',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const {
        month,
        startDate,
        endDate,
        personnelId: personnelIdParam,
        reasonType,
      } = request.query as {
        month?: string
        startDate?: string
        endDate?: string
        personnelId?: string
        reasonType?: string
      }

      const where: {
        fineDate?: { gte?: Date; lt?: Date; lte?: Date }
        personnelId?: number
        reasonType?: string
      } = {}

      const monthRange = parseMonthRange(month)
      if (monthRange) {
        where.fineDate = { gte: monthRange.gte, lt: monthRange.lt }
      } else if (startDate || endDate) {
        where.fineDate = {}
        if (startDate) where.fineDate.gte = new Date(startDate)
        if (endDate) {
          // endDate 取当天结束
          const ed = new Date(endDate)
          ed.setHours(23, 59, 59, 999)
          where.fineDate.lte = ed
        }
      }
      if (personnelIdParam) {
        const pid = Number(personnelIdParam)
        if (!Number.isNaN(pid)) where.personnelId = pid
      }
      if (reasonType && isValidReasonType(reasonType)) {
        where.reasonType = reasonType
      }

      const fines = await prisma.fine.findMany({
        where,
        include: {
          personnel: { select: { id: true, name: true } },
        },
        orderBy: [{ fineDate: 'desc' }, { createdAt: 'desc' }],
      })

      return reply.send(fines)
    }
  )

  // POST /api/fines - 新增罚款记录
  fastify.post(
    '/api/fines',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        personnelId?: number
        amount?: number
        fineDate?: string
        reasonType?: string
        remark?: string
      }

      if (!body.personnelId || !body.amount || !body.fineDate) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }
      if (!isNonNegInt(body.amount)) {
        return reply.code(400).send({ error: '罚款金额必须为正整数' })
      }
      if (body.amount === 0) {
        return reply.code(400).send({ error: '罚款金额必须大于0' })
      }
      const reasonType = body.reasonType ?? 'OTHER'
      if (!isValidReasonType(reasonType)) {
        return reply.code(400).send({ error: '无效的罚款原因分类' })
      }
      const remark = body.remark?.trim() || null
      if (remark && remark.length > 100) {
        return reply.code(400).send({ error: '备注不能超过100字' })
      }

      // 校验人员存在
      const personnel = await prisma.finePersonnel.findUnique({
        where: { id: body.personnelId },
      })
      if (!personnel) {
        return reply.code(400).send({ error: '人员不存在' })
      }

      const fine = await prisma.fine.create({
        data: {
          personnelId: body.personnelId,
          amount: body.amount,
          fineDate: new Date(body.fineDate),
          reasonType,
          remark,
          createdBy: currentUser.id,
        },
        include: {
          personnel: { select: { id: true, name: true } },
        },
      })

      return reply.send(fine)
    }
  )

  // PUT /api/fines/:id - 修改罚款记录
  fastify.put(
    '/api/fines/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id: idParam } = request.params as { id: string }
      const id = Number(idParam)
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: '无效的罚款记录 ID' })
      }

      const body = request.body as {
        personnelId?: number
        amount?: number
        fineDate?: string
        reasonType?: string
        remark?: string
      }

      if (!body.personnelId || !body.amount || !body.fineDate) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }
      if (!isNonNegInt(body.amount) || body.amount === 0) {
        return reply.code(400).send({ error: '罚款金额必须为正整数' })
      }
      const reasonType = body.reasonType ?? 'OTHER'
      if (!isValidReasonType(reasonType)) {
        return reply.code(400).send({ error: '无效的罚款原因分类' })
      }
      const remark = body.remark?.trim() || null
      if (remark && remark.length > 100) {
        return reply.code(400).send({ error: '备注不能超过100字' })
      }

      const fine = await prisma.fine.update({
        where: { id },
        data: {
          personnelId: body.personnelId,
          amount: body.amount,
          fineDate: new Date(body.fineDate),
          reasonType,
          remark,
        },
        include: {
          personnel: { select: { id: true, name: true } },
        },
      })

      return reply.send(fine)
    }
  )

  // DELETE /api/fines/:id - 删除罚款记录
  fastify.delete(
    '/api/fines/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id: idParam } = request.params as { id: string }
      const id = Number(idParam)
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: '无效的罚款记录 ID' })
      }

      await prisma.fine.delete({ where: { id } })
      return reply.send({ message: '已删除' })
    }
  )

  // ============ 罚款汇总 ============

  // GET /api/fines/summary - 按月份或日期范围汇总罚款
  // 查询参数：month（YYYY-MM，可选，优先于 startDate/endDate）、startDate, endDate（均可选，默认本月）
  // 返回：总额、按人员汇总、按原因分类汇总、按月汇总
  fastify.get(
    '/api/fines/summary',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { month, startDate, endDate } = request.query as {
        month?: string
        startDate?: string
        endDate?: string
      }

      // 优先使用 month；否则使用 startDate/endDate；均未提供时默认本月
      const monthRange = parseMonthRange(month)
      const now = new Date()
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

      let where: { fineDate: { gte: Date; lt?: Date; lte?: Date } }
      if (monthRange) {
        where = { fineDate: { gte: monthRange.gte, lt: monthRange.lt } }
      } else if (startDate || endDate) {
        where = {
          fineDate: {
            gte: startDate ? new Date(startDate) : defaultStart,
            lte: endDate
              ? (() => {
                  const ed = new Date(endDate)
                  ed.setHours(23, 59, 59, 999)
                  return ed
                })()
              : defaultEnd,
          },
        }
      } else {
        where = { fineDate: { gte: defaultStart, lte: defaultEnd } }
      }

      const fines = await prisma.fine.findMany({
        where,
        include: {
          personnel: { select: { id: true, name: true } },
        },
        orderBy: [{ fineDate: 'desc' }, { createdAt: 'desc' }],
      })

      // 总额
      const totalAmount = fines.reduce((sum, f) => sum + f.amount, 0)

      // 按人员汇总
      const byPersonnel = new Map<number, { name: string; count: number; amount: number }>()
      for (const f of fines) {
        const existing = byPersonnel.get(f.personnelId)
        if (existing) {
          existing.count += 1
          existing.amount += f.amount
        } else {
          byPersonnel.set(f.personnelId, {
            name: f.personnel.name,
            count: 1,
            amount: f.amount,
          })
        }
      }

      // 按原因分类汇总
      const byReasonType: Record<string, { count: number; amount: number }> = {}
      for (const f of fines) {
        if (!byReasonType[f.reasonType]) {
          byReasonType[f.reasonType] = { count: 0, amount: 0 }
        }
        byReasonType[f.reasonType].count += 1
        byReasonType[f.reasonType].amount += f.amount
      }

      // 按月汇总（YYYY-MM）
      const byMonth: Record<string, { count: number; amount: number }> = {}
      for (const f of fines) {
        const monthKey = `${f.fineDate.getFullYear()}-${String(f.fineDate.getMonth() + 1).padStart(2, '0')}`
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { count: 0, amount: 0 }
        }
        byMonth[monthKey].count += 1
        byMonth[monthKey].amount += f.amount
      }

      return reply.send({
        totalAmount,
        totalCount: fines.length,
        byPersonnel: Array.from(byPersonnel.entries()).map(([id, v]) => ({
          personnelId: id,
          name: v.name,
          count: v.count,
          amount: v.amount,
        })),
        byReasonType,
        byMonth,
      })
    }
  )

  // ============ 罚款导出 ============

  // 导出按人员汇总（金额累加），列：序号、姓名、罚款次数、罚款总额
  // 参数：personnelIds（可选，有则仅导出选中人员）、month（可选，YYYY-MM，有则仅导出该月数据）
  async function buildFinesSummaryRows(
    personnelIds?: number[],
    month?: string
  ) {
    const where: {
      personnelId?: { in: number[] }
      fineDate?: { gte: Date; lt: Date }
    } = {}
    if (personnelIds && personnelIds.length > 0) {
      where.personnelId = { in: personnelIds }
    }
    const monthRange = parseMonthRange(month)
    if (monthRange) {
      where.fineDate = { gte: monthRange.gte, lt: monthRange.lt }
    }
    const fines = await prisma.fine.findMany({
      where,
      include: { personnel: { select: { id: true, name: true } } },
      orderBy: [{ fineDate: 'desc' }, { createdAt: 'desc' }],
    })

    // 按人员累加
    const summaryMap = new Map<number, { name: string; count: number; amount: number }>()
    for (const f of fines) {
      const existing = summaryMap.get(f.personnelId)
      if (existing) {
        existing.count += 1
        existing.amount += f.amount
      } else {
        summaryMap.set(f.personnelId, {
          name: f.personnel.name,
          count: 1,
          amount: f.amount,
        })
      }
    }
    // 按金额降序排列
    const sorted = Array.from(summaryMap.entries())
      .map(([id, v]) => ({ personnelId: id, ...v }))
      .sort((a, b) => b.amount - a.amount)

    return sorted.map((item, idx) => ({
      序号: idx + 1,
      姓名: item.name,
      罚款次数: item.count,
      罚款总额: item.amount,
    }))
  }

  // GET /api/fines/export/excel - 导出罚款汇总 Excel（按人员累加）
  // 查询参数：personnelIds（可选，逗号分隔）、month（可选，YYYY-MM）
  fastify.get(
    '/api/fines/export/excel',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const query = request.query as { personnelIds?: string; month?: string }
      const personnelIds = query.personnelIds
        ? query.personnelIds
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => !Number.isNaN(n) && n > 0)
        : undefined

      const data = await buildFinesSummaryRows(personnelIds, query.month)

      const worksheet = xlsx.utils.json_to_sheet(data)
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, '罚款汇总')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const monthText = query.month ? `${formatMonthCN(query.month)}` : ''
      const scopeText =
        personnelIds && personnelIds.length > 0
          ? `_选中${personnelIds.length}人`
          : ''
      const filename = `罚款汇总${monthText ? '_' + monthText : ''}${scopeText}.xlsx`
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

  // GET /api/fines/export/csv - 导出罚款汇总 CSV（按人员累加）
  // 查询参数：personnelIds（可选，逗号分隔）、month（可选，YYYY-MM）
  fastify.get(
    '/api/fines/export/csv',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const query = request.query as { personnelIds?: string; month?: string }
      const personnelIds = query.personnelIds
        ? query.personnelIds
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => !Number.isNaN(n) && n > 0)
        : undefined

      const data = await buildFinesSummaryRows(personnelIds, query.month)

      const fields = [
        { label: '序号', value: '序号' },
        { label: '姓名', value: '姓名' },
        { label: '罚款次数', value: '罚款次数' },
        { label: '罚款总额', value: '罚款总额' },
      ]
      const parser = new Json2CSVParser({ fields })
      const csv = parser.parse(data)
      const bom = '\uFEFF'

      const monthText = query.month ? `${formatMonthCN(query.month)}` : ''
      const scopeText =
        personnelIds && personnelIds.length > 0
          ? `_选中${personnelIds.length}人`
          : ''
      const filename = `罚款汇总${monthText ? '_' + monthText : ''}${scopeText}.csv`
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(bom + csv)
    }
  )
}
