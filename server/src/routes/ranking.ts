import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { getWeekStart } from '../utils/week'
import { computeRanking, resolveQueryBranchId } from '../utils/welfare'

export default async function rankingRoutes(fastify: FastifyInstance) {
  // GET /api/ranking - 查询周排名
  fastify.get(
    '/api/ranking',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam } =
        request.query as { weekStart?: string; branchId?: string }

      const weekStart = weekStartParam
        ? getWeekStart(new Date(weekStartParam))
        : getWeekStart()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const ranking = await computeRanking(weekStart, branchFilter)

      return reply.send(ranking)
    }
  )
}
