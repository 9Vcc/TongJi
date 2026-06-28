import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { Role, StatCycle } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'

function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

/**
 * 根据 cycle 和请求参数解析 periodStart
 * - WEEK：使用 weekStart 参数（或当前周），归一到周一
 * - MONTH：使用 weekStart 参数所在月的1号（或当前月1号）
 */
function resolvePeriodStart(
  cycle: StatCycle,
  weekStartParam?: string
): Date {
  const ref = weekStartParam ? new Date(weekStartParam) : new Date()
  if (cycle === StatCycle.MONTH) {
    return new Date(ref.getFullYear(), ref.getMonth(), 1)
  }
  return getWeekStart(ref)
}

export default async function deductionRoutes(fastify: FastifyInstance) {
  // GET /api/deductions - 查询指定周期+厅的扣减列表
  // 查询参数：weekStart, branchId, cycle
  fastify.get(
    '/api/deductions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const cycle: StatCycle = cycleParam === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
      const periodStart = resolvePeriodStart(cycle, weekStartParam)

      // 分部权限：会长可指定任意厅；超管/管理限定本厅
      let branchFilter: number | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          branchFilter = Number.isNaN(n) ? undefined : n
        }
      } else {
        branchFilter = currentUser.branchId ?? undefined
      }

      const deductions = await prisma.deduction.findMany({
        where: {
          periodStart,
          ...(branchFilter ? { branchId: branchFilter } : {}),
        },
        include: {
          personnel: { select: { id: true, name: true } },
        },
      })

      return reply.send(deductions)
    }
  )

  // PUT /api/deductions - upsert 扣减金额（会长+超管）
  // body: { branchId, personnelId, weekStart, cycle, amount }
  fastify.put(
    '/api/deductions',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        personnelId?: number
        weekStart?: string
        cycle?: 'WEEK' | 'MONTH'
        amount?: number
      }

      if (
        !body.branchId ||
        !body.personnelId ||
        body.amount === undefined
      ) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }
      if (!isNonNegInt(body.amount)) {
        return reply.code(400).send({ error: '扣减金额必须为非负整数' })
      }

      // 权限校验：超管只能操作本厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (
          currentUser.branchId === null ||
          body.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能操作本分部扣减' })
        }
      }

      const cycle: StatCycle = body.cycle === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
      const periodStart = resolvePeriodStart(cycle, body.weekStart)

      // 校验人员属于该分部
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

      const result = await prisma.deduction.upsert({
        where: {
          branchId_personnelId_periodStart: {
            branchId: body.branchId,
            personnelId: body.personnelId,
            periodStart,
          },
        },
        update: {
          amount: body.amount,
        },
        create: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          periodStart,
          amount: body.amount,
          createdBy: currentUser.id,
        },
      })

      return reply.send(result)
    }
  )

  // DELETE /api/deductions - 删除扣减（清零，会长+超管）
  // body: { branchId, personnelId, weekStart, cycle }
  fastify.delete(
    '/api/deductions',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        personnelId?: number
        weekStart?: string
        cycle?: 'WEEK' | 'MONTH'
      }

      if (!body.branchId || !body.personnelId) {
        return reply.code(400).send({ error: '缺少必要参数' })
      }

      // 权限校验：超管只能操作本厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (
          currentUser.branchId === null ||
          body.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能操作本分部扣减' })
        }
      }

      const cycle: StatCycle = body.cycle === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
      const periodStart = resolvePeriodStart(cycle, body.weekStart)

      await prisma.deduction.deleteMany({
        where: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          periodStart,
        },
      })

      return reply.send({ message: '扣减已清除' })
    }
  )
}
