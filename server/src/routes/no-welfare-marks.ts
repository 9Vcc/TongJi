import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch } from '../middleware/auth'
import { Role, StatCycle } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'

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

/**
 * 规范化备注：trim、限100字、空字符串归 null
 */
function normalizeRemark(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed
}

export default async function noWelfareMarkRoutes(fastify: FastifyInstance) {
  // GET /api/no-welfare-marks - 查询指定周期+厅的无福利标记列表
  // 查询参数：weekStart, branchId, cycle
  // 所有已认证用户可查询（管理限定本厅，超管限定授权厅，会长任意）
  fastify.get(
    '/api/no-welfare-marks',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const cycle: StatCycle = cycleParam === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
      const periodStart = resolvePeriodStart(cycle, weekStartParam)

      // 分部权限：会长可指定任意厅；超管/管理限定本厅（超管支持授权厅列表）
      let branchFilter: number | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          branchFilter = Number.isNaN(n) ? undefined : n
        }
      } else if (currentUser.role === Role.CHAOGUAN) {
        // 超管：指定厅需在授权范围内；未指定则查全部授权厅（branchId: { in: branchIds }）
        if (branchIdParam) {
          const n = Number(branchIdParam)
          if (!Number.isNaN(n) && canAccessBranch(currentUser, n)) {
            branchFilter = n
          } else {
            return reply.send([])
          }
        }
      } else {
        // 管理：限定本厅
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

      const marks = await prisma.noWelfareMark.findMany({
        where: {
          periodStart,
          ...whereBranch,
        },
        include: {
          personnel: { select: { id: true, name: true } },
        },
      })

      return reply.send(marks)
    }
  )

  // PUT /api/no-welfare-marks - 设置/更新无福利标记（会长+超管）
  // body: { branchId, personnelId, weekStart, cycle, remark? }
  // 标记后该人员该周期福利清零（扣减仍生效，最终福利 = max(0, 0 - deduction) = 0）
  fastify.put(
    '/api/no-welfare-marks',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as {
        branchId?: number
        personnelId?: number
        weekStart?: string
        cycle?: 'WEEK' | 'MONTH'
        remark?: string
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

      const remark = normalizeRemark(body.remark)
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

      const result = await prisma.noWelfareMark.upsert({
        where: {
          branchId_personnelId_periodStart: {
            branchId: body.branchId,
            personnelId: body.personnelId,
            periodStart,
          },
        },
        update: {
          remark,
        },
        create: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          periodStart,
          remark,
          createdBy: currentUser.id,
        },
      })

      return reply.send(result)
    }
  )

  // DELETE /api/no-welfare-marks - 取消无福利标记（会长+超管）
  // body: { branchId, personnelId, weekStart, cycle }
  fastify.delete(
    '/api/no-welfare-marks',
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

      // 权限校验：超管只能操作授权厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, body.branchId)) {
          return reply.code(403).send({ error: '只能操作授权厅' })
        }
      }

      const cycle: StatCycle = body.cycle === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
      const periodStart = resolvePeriodStart(cycle, body.weekStart)

      await prisma.noWelfareMark.deleteMany({
        where: {
          branchId: body.branchId,
          personnelId: body.personnelId,
          periodStart,
        },
      })

      return reply.send({ message: '已取消无福利标记' })
    }
  )
}
