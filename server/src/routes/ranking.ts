import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
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
 * - 超管/管理：始终限定本厅；viewAll=true 时仅切换为按月统计本厅数据
 */
function resolveRankingBranchId(
  currentUser: { role: Role; branchId: number | null },
  requestedBranchId: string | undefined,
  _viewAll: string | undefined
): number | undefined {
  if (currentUser.role === Role.HUIZHANG) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      return Number.isNaN(n) ? undefined : n
    }
    return undefined
  }
  // 超管/管理：始终限定本厅，不可查看全部厅
  return currentUser.branchId ?? undefined
}

export default async function rankingRoutes(fastify: FastifyInstance) {
  // GET /api/ranking - 查询周期排名（按厅统计周期：周或月聚合）
  fastify.get(
    '/api/ranking',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string }

      const refDate = weekStartParam
        ? new Date(weekStartParam)
        : new Date()

      const branchFilter = resolveRankingBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      const ranking = await computeRanking(refDate, branchFilter, cycle)

      return reply.send(ranking)
    }
  )
}
