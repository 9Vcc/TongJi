import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'
import { isNonNegInt } from '../utils/validation'

/**
 * 规范化备注：trim、限100字、空字符串归 null
 */
function normalizeRemark(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed
}

export default async function violationMarkRoutes(fastify: FastifyInstance) {
  // ============ 违规项目 CRUD（仅会长+超管可操作） ============

  // GET /api/violation-items - 获取指定厅的违规项目列表
  // 会长可查任意厅；超管仅授权厅；管理不可访问
  fastify.get(
    '/api/violation-items',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

      // 管理不可访问违规项目
      if (currentUser.role === Role.GUANLI) {
        return reply.code(403).send({ error: '无权访问违规项目' })
      }

      if (!branchIdParam) {
        return reply.code(400).send({ error: '缺少 branchId 参数' })
      }
      const branchId = Number(branchIdParam)
      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的 branchId' })
      }

      // 超管只能查看授权厅
      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, branchId)
      ) {
        return reply.code(403).send({ error: '只能查看授权厅' })
      }

      const items = await prisma.violationItem.findMany({
        where: { branchId },
        orderBy: [{ id: 'asc' }],
      })

      return reply.send(items)
    }
  )

  // POST /api/violation-items - 创建违规项目（会长+超管）
  // body: { branchId, name, deductionAmount?, thresholdCount? }
  fastify.post(
    '/api/violation-items',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        name?: string
        deductionAmount?: number
        thresholdCount?: number
      }

      if (!body.branchId) {
        return reply.code(400).send({ error: '缺少 branchId' })
      }

      // 权限校验：超管只能操作授权厅
      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, body.branchId)
      ) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      if (!body.name || !body.name.trim()) {
        return reply.code(400).send({ error: '违规项目名称不能为空' })
      }
      const name = body.name.trim().slice(0, 20)

      // 扣减金额：非负整数，默认 0
      let deductionAmount = 0
      if (body.deductionAmount !== undefined) {
        if (!isNonNegInt(body.deductionAmount)) {
          return reply.code(400).send({ error: '扣减金额必须为非负整数' })
        }
        deductionAmount = body.deductionAmount
      }
      // 阈值次数：非负整数，默认 0（0=不启用阈值清空）
      let thresholdCount = 0
      if (body.thresholdCount !== undefined) {
        if (!isNonNegInt(body.thresholdCount)) {
          return reply.code(400).send({ error: '阈值次数必须为非负整数' })
        }
        thresholdCount = body.thresholdCount
      }

      try {
        const created = await prisma.violationItem.create({
          data: {
            branchId: body.branchId,
            name,
            deductionAmount,
            thresholdCount,
          },
        })
        return reply.code(201).send(created)
      } catch (error) {
        // 唯一约束冲突：同厅下违规项目名称已存在
        if ((error as { code?: string }).code === 'P2002') {
          return reply.code(409).send({ error: '违规项目名称已存在' })
        }
        throw error
      }
    }
  )

  // PUT /api/violation-items/:id - 更新违规项目（会长+超管）
  // body: { name?, deductionAmount?, thresholdCount? }
  fastify.put(
    '/api/violation-items/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const itemId = Number(id)
      if (Number.isNaN(itemId)) {
        return reply.code(400).send({ error: '无效的项目ID' })
      }

      const existing = await prisma.violationItem.findUnique({
        where: { id: itemId },
      })
      if (!existing) {
        return reply.code(404).send({ error: '违规项目不存在' })
      }

      // 权限校验：超管只能操作授权厅
      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, existing.branchId)
      ) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      const body = request.body as {
        name?: string
        deductionAmount?: number
        thresholdCount?: number
      }

      const data: {
        name?: string
        deductionAmount?: number
        thresholdCount?: number
      } = {}
      if (body.name !== undefined) {
        if (!body.name.trim()) {
          return reply.code(400).send({ error: '违规项目名称不能为空' })
        }
        data.name = body.name.trim().slice(0, 20)
      }
      if (body.deductionAmount !== undefined) {
        if (!isNonNegInt(body.deductionAmount)) {
          return reply.code(400).send({ error: '扣减金额必须为非负整数' })
        }
        data.deductionAmount = body.deductionAmount
      }
      if (body.thresholdCount !== undefined) {
        if (!isNonNegInt(body.thresholdCount)) {
          return reply.code(400).send({ error: '阈值次数必须为非负整数' })
        }
        data.thresholdCount = body.thresholdCount
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      try {
        const updated = await prisma.violationItem.update({
          where: { id: itemId },
          data,
        })
        return reply.send(updated)
      } catch (error) {
        // 唯一约束冲突：同厅下违规项目名称已存在
        if ((error as { code?: string }).code === 'P2002') {
          return reply.code(409).send({ error: '违规项目名称已存在' })
        }
        throw error
      }
    }
  )

  // DELETE /api/violation-items/:id - 删除违规项目（级联删除关联记录）
  fastify.delete(
    '/api/violation-items/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const itemId = Number(id)
      if (Number.isNaN(itemId)) {
        return reply.code(400).send({ error: '无效的项目ID' })
      }

      const existing = await prisma.violationItem.findUnique({
        where: { id: itemId },
      })
      if (!existing) {
        return reply.code(404).send({ error: '违规项目不存在' })
      }

      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, existing.branchId)
      ) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      // 级联删除关联的 ViolationRecord（schema 已配置 onDelete: Cascade）
      await prisma.violationItem.delete({ where: { id: itemId } })

      return reply.code(204).send()
    }
  )

  // ============ 违规记录 CRUD（会长+超管可操作，管理可查看） ============

  // GET /api/violation-records/months - 获取有违规记录的月份列表
  // 返回 string[]（ISO 格式月份起点），按降序排列
  // 会长不传 branchId 时返回所有厅的月份
  fastify.get(
    '/api/violation-records/months',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

      // 分部权限：会长可指定任意厅或不传（全部厅）；超管仅授权厅；管理仅本厅
      let branchFilter: number | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          branchFilter = Number.isNaN(n) ? undefined : n
        }
      } else if (currentUser.role === Role.CHAOGUAN) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          if (!Number.isNaN(n) && canAccessBranch(currentUser, n)) {
            branchFilter = n
          } else {
            return reply.send([])
          }
        }
      } else {
        branchFilter = currentUser.branchId ?? undefined
      }

      // 超管未指定厅时查询所有授权厅
      let whereBranch: { branchId?: number | { in: number[] } }
      if (branchFilter) {
        whereBranch = { branchId: branchFilter }
      } else if (currentUser.role === Role.CHAOGUAN) {
        whereBranch = { branchId: { in: currentUser.branchIds } }
      } else {
        whereBranch = {}
      }

      const records = await prisma.violationRecord.findMany({
        where: whereBranch,
        select: { periodStart: true },
        distinct: ['periodStart'],
        orderBy: { periodStart: 'desc' },
      })

      return reply.send(records.map((r) => r.periodStart.toISOString()))
    }
  )

  // GET /api/violation-records - 获取违规记录列表
  // 查询参数：branchId, periodStart（必填）
  // 会长可查任意厅；超管仅授权厅；管理仅本厅
  // 按 violationDate 降序排列，含 item、personnel、branch 详情
  fastify.get(
    '/api/violation-records',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam, periodStart: periodStartParam } =
        request.query as { branchId?: string; periodStart?: string }

      if (!periodStartParam) {
        return reply.code(400).send({ error: '缺少 periodStart 参数' })
      }
      const periodStart = new Date(periodStartParam)
      if (Number.isNaN(periodStart.getTime())) {
        return reply.code(400).send({ error: '无效的 periodStart' })
      }

      // 分部权限
      let branchFilter: number | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          branchFilter = Number.isNaN(n) ? undefined : n
        }
      } else if (currentUser.role === Role.CHAOGUAN) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          if (!Number.isNaN(n) && canAccessBranch(currentUser, n)) {
            branchFilter = n
          } else {
            return reply.send([])
          }
        }
      } else {
        branchFilter = currentUser.branchId ?? undefined
      }

      // 超管未指定厅时查询所有授权厅
      let whereBranch: { branchId?: number | { in: number[] } }
      if (branchFilter) {
        whereBranch = { branchId: branchFilter }
      } else if (currentUser.role === Role.CHAOGUAN) {
        whereBranch = { branchId: { in: currentUser.branchIds } }
      } else {
        whereBranch = {}
      }

      const records = await prisma.violationRecord.findMany({
        where: {
          periodStart,
          ...whereBranch,
        },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              deductionAmount: true,
              thresholdCount: true,
            },
          },
          personnel: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { violationDate: 'desc' },
      })

      return reply.send(records)
    }
  )

  // POST /api/violation-records - 创建违规记录（会长+超管）
  // body: { branchId, personnelId, violationItemId, violationDate, periodStart, remark? }
  fastify.post(
    '/api/violation-records',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        personnelId?: number
        violationItemId?: number
        violationDate?: string
        periodStart?: string
        remark?: string
      }

      if (
        !body.branchId ||
        !body.personnelId ||
        !body.violationItemId ||
        !body.violationDate ||
        !body.periodStart
      ) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }

      // 权限校验：超管只能操作授权厅
      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, body.branchId)
      ) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      // 日期转换
      const violationDate = new Date(body.violationDate)
      if (Number.isNaN(violationDate.getTime())) {
        return reply.code(400).send({ error: '无效的 violationDate' })
      }
      const periodStart = new Date(body.periodStart)
      if (Number.isNaN(periodStart.getTime())) {
        return reply.code(400).send({ error: '无效的 periodStart' })
      }

      // 校验违规项目属于该厅
      const item = await prisma.violationItem.findFirst({
        where: { id: body.violationItemId, branchId: body.branchId },
      })
      if (!item) {
        return reply.code(400).send({ error: '违规项目不属于该分部' })
      }

      // 校验人员属于该厅（通过 PersonnelBranch）
      const assoc = await prisma.personnelBranch.findUnique({
        where: {
          personnelId_branchId: {
            personnelId: body.personnelId,
            branchId: body.branchId,
          },
        },
      })
      if (!assoc) {
        return reply.code(400).send({ error: '人员不属于该分部' })
      }

      const remark = normalizeRemark(body.remark)

      const created = await prisma.violationRecord.create({
        data: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          violationItemId: body.violationItemId,
          violationDate,
          periodStart,
          remark,
          createdBy: currentUser.id,
        },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              deductionAmount: true,
              thresholdCount: true,
            },
          },
          personnel: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      })

      return reply.code(201).send(created)
    }
  )

  // PUT /api/violation-records/:id - 更新违规记录（会长+超管）
  // body: { violationItemId?, violationDate?, periodStart?, remark? }
  fastify.put(
    '/api/violation-records/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const existing = await prisma.violationRecord.findUnique({
        where: { id: recordId },
      })
      if (!existing) {
        return reply.code(404).send({ error: '违规记录不存在' })
      }

      // 权限校验：超管只能操作授权厅
      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, existing.branchId)
      ) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      const body = request.body as {
        violationItemId?: number
        violationDate?: string
        periodStart?: string
        remark?: string
      }

      const data: {
        violationItemId?: number
        violationDate?: Date
        periodStart?: Date
        remark?: string | null
      } = {}

      if (body.violationItemId !== undefined) {
        // 校验新违规项目属于该记录所在厅
        const item = await prisma.violationItem.findFirst({
          where: { id: body.violationItemId, branchId: existing.branchId },
        })
        if (!item) {
          return reply.code(400).send({ error: '违规项目不属于该分部' })
        }
        data.violationItemId = body.violationItemId
      }
      if (body.violationDate !== undefined) {
        const d = new Date(body.violationDate)
        if (Number.isNaN(d.getTime())) {
          return reply.code(400).send({ error: '无效的 violationDate' })
        }
        data.violationDate = d
      }
      if (body.periodStart !== undefined) {
        const d = new Date(body.periodStart)
        if (Number.isNaN(d.getTime())) {
          return reply.code(400).send({ error: '无效的 periodStart' })
        }
        data.periodStart = d
      }
      if (body.remark !== undefined) {
        data.remark = normalizeRemark(body.remark)
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      const updated = await prisma.violationRecord.update({
        where: { id: recordId },
        data,
        include: {
          item: {
            select: {
              id: true,
              name: true,
              deductionAmount: true,
              thresholdCount: true,
            },
          },
          personnel: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/violation-records/:id - 删除违规记录（会长+超管）
  fastify.delete(
    '/api/violation-records/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const existing = await prisma.violationRecord.findUnique({
        where: { id: recordId },
      })
      if (!existing) {
        return reply.code(404).send({ error: '违规记录不存在' })
      }

      if (
        currentUser.role === Role.CHAOGUAN &&
        !canAccessBranch(currentUser, existing.branchId)
      ) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      await prisma.violationRecord.delete({ where: { id: recordId } })

      return reply.code(204).send()
    }
  )
}
