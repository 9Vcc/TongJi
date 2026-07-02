import type { FastifyInstance } from 'fastify'
import { authenticate, canAccessBranch, getAccessibleBranchIds } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
import prisma from '../lib/prisma'
import {
  computeRanking,
  resolveCycle,
} from '../utils/welfare'

/**
 * 解析周期参数：优先使用前端显式传入的 cycle，否则按厅统计周期
 */
async function resolveCycleParam(
  cycleParam: string | undefined,
  branchFilter: number | undefined
): Promise<StatCycle> {
  if (cycleParam === 'MONTH') return StatCycle.MONTH
  if (cycleParam === 'WEEK') return StatCycle.WEEK
  return resolveCycle(branchFilter)
}

/**
 * 解析排名查询的分部过滤
 * - 会长：可指定任意厅或全部厅
 * - 超管：可查看指定授权厅，未指定时返回 undefined（由调用方用 branchIds 过滤）
 * - 管理：始终限定本厅
 */
function resolveRankingBranchId(
  currentUser: { role: Role; branchId: number | null; branchIds: number[] },
  requestedBranchId: string | undefined
): number | undefined {
  if (currentUser.role === Role.HUIZHANG) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      return Number.isNaN(n) ? undefined : n
    }
    return undefined
  }
  // 超管：可查看指定授权厅，未指定时返回 undefined（由调用方用 branchIds 过滤）
  if (currentUser.role === Role.CHAOGUAN) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      if (!Number.isNaN(n) && canAccessBranch(currentUser, n)) {
        return n
      }
    }
    return undefined
  }
  // 管理：始终限定本厅
  return currentUser.branchId ?? undefined
}

export default async function rankingRoutes(fastify: FastifyInstance) {
  // GET /api/ranking - 查询周期排名（按厅统计周期：周或月聚合）
  // 指定单厅：按该厅 statCycle 查询
  // 全部厅（会长）：按各厅自身 statCycle 分别查询后合并（周统计厅查本周、月统计厅查本月）
  fastify.get(
    '/api/ranking',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const refDate = weekStartParam
        ? new Date(weekStartParam)
        : new Date()

      const branchFilter = resolveRankingBranchId(currentUser, branchIdParam)

      // 指定单厅：按该厅 cycle 查询
      if (branchFilter) {
        const cycle = await resolveCycleParam(cycleParam, branchFilter)
        const ranking = await computeRanking(refDate, branchFilter, cycle)
        return reply.send(ranking)
      }

      // 全部厅：会长查所有厅，超管仅查授权厅
      const accessibleIds = getAccessibleBranchIds(currentUser)
      const allBranches = await prisma.branch.findMany({
        where: accessibleIds ? { id: { in: accessibleIds } } : {},
        select: { id: true, statCycle: true },
      })
      const results = await Promise.all(
        allBranches.map((b) => {
          const cycle =
            cycleParam === 'MONTH'
              ? StatCycle.MONTH
              : cycleParam === 'WEEK'
                ? StatCycle.WEEK
                : b.statCycle
          return computeRanking(refDate, b.id, cycle)
        })
      )
      return reply.send(results.flat())
    }
  )
}
