import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'

/**
 * 将 weekStart 参数解析为月初1日（periodStart 固定为月初1日）
 * 主持流水福利按月计算，无论厅是按周还是按月统计
 */
function resolveMonthStart(weekStartParam?: string): Date {
  const ref = weekStartParam ? new Date(weekStartParam) : new Date()
  return new Date(ref.getFullYear(), ref.getMonth(), 1)
}

/**
 * 校验流水金额：非负数，最多两位小数
 */
function isNonNegDecimal2(v: unknown): boolean {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false
  // 最多两位小数
  const rounded = Math.round(v * 100) / 100
  return rounded === v
}

export default async function hostFlowRecordRoutes(fastify: FastifyInstance) {
  // GET /api/host-flow-records - 查询指定月份+厅的主持流水记录
  // 查询参数：month (YYYY-MM-DD, 月内任意日期), branchId
  // 所有已认证用户可查询（管理限定本厅，超管限定授权厅，会长任意）
  fastify.get(
    '/api/host-flow-records',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { month: monthParam, branchId: branchIdParam } =
        request.query as { month?: string; branchId?: string }

      const periodStart = resolveMonthStart(monthParam)

      // 分部权限：会长可指定任意厅；超管/管理限定本厅（超管支持授权厅列表）
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

      const records = await prisma.hostFlowRecord.findMany({
        where: {
          periodStart,
          ...whereBranch,
        },
        include: {
          personnel: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: [{ branchId: 'asc' }, { personnelId: 'asc' }],
      })

      return reply.send(records)
    }
  )

  // PUT /api/host-flow-records - 设置/更新主持流水记录（会长+超管）
  // body: { branchId, personnelId, month, totalFlow }
  // 流水福利 = totalFlow × 厅倍率(flowMultiplier) / 100
  fastify.put(
    '/api/host-flow-records',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        personnelId?: number
        month?: string
        totalFlow?: number
      }

      if (!body.branchId || !body.personnelId) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }

      if (body.totalFlow === undefined || !isNonNegDecimal2(body.totalFlow)) {
        return reply.code(400).send({ error: '总流水必须为非负数（最多两位小数）' })
      }

      // 权限校验：超管只能操作授权厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, body.branchId)) {
          return reply.code(403).send({ error: '只能操作授权厅' })
        }
      }

      const periodStart = resolveMonthStart(body.month)

      // 校验人员属于该分部且为主持
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
      if (!assoc.isHost) {
        return reply.code(400).send({ error: '该人员未标记为主持，无法录入流水' })
      }

      // totalFlow 为 0 时删除记录（清零）
      if (body.totalFlow === 0) {
        await prisma.hostFlowRecord.deleteMany({
          where: {
            branchId: body.branchId,
            personnelId: body.personnelId,
            periodStart,
          },
        })
        return reply.send({ message: '流水记录已清零' })
      }

      const result = await prisma.hostFlowRecord.upsert({
        where: {
          branchId_personnelId_periodStart: {
            branchId: body.branchId,
            personnelId: body.personnelId,
            periodStart,
          },
        },
        update: {
          totalFlow: body.totalFlow,
        },
        create: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          periodStart,
          totalFlow: body.totalFlow,
          createdBy: currentUser.id,
        },
      })

      return reply.send(result)
    }
  )

  // DELETE /api/host-flow-records - 删除主持流水记录（会长+超管）
  // body: { branchId, personnelId, month }
  fastify.delete(
    '/api/host-flow-records',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        personnelId?: number
        month?: string
      }

      if (!body.branchId || !body.personnelId) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }

      // 权限校验：超管只能操作授权厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, body.branchId)) {
          return reply.code(403).send({ error: '只能操作授权厅' })
        }
      }

      const periodStart = resolveMonthStart(body.month)

      await prisma.hostFlowRecord.deleteMany({
        where: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          periodStart,
        },
      })

      return reply.send({ message: '流水记录已删除' })
    }
  )

  // GET /api/host-flow-records/months - 查询有流水记录的月份列表
  // 返回已录入流水的月份（YYYY-MM-DD 月初1日），按降序排列
  fastify.get(
    '/api/host-flow-records/months',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

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

      let whereBranch: { branchId?: number | { in: number[] } }
      if (branchFilter) {
        whereBranch = { branchId: branchFilter }
      } else if (currentUser.role === Role.CHAOGUAN) {
        whereBranch = { branchId: { in: currentUser.branchIds } }
      } else {
        whereBranch = {}
      }

      const records = await prisma.hostFlowRecord.findMany({
        where: whereBranch,
        select: { periodStart: true },
        distinct: ['periodStart'],
        orderBy: { periodStart: 'desc' },
      })

      // 始终包含当前月
      const currentMonthStart = new Date()
      currentMonthStart.setDate(1)
      currentMonthStart.setHours(0, 0, 0, 0)
      const months = records.map((r) => r.periodStart)
      const hasCurrentMonth = months.some(
        (m) => m.getTime() === currentMonthStart.getTime(),
      )
      if (!hasCurrentMonth) {
        months.unshift(currentMonthStart)
      }

      return reply.send(months)
    }
  )
}
