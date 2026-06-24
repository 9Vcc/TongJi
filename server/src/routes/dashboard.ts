import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { getWeekStart } from '../utils/week'
import { computeRanking, resolveQueryBranchId } from '../utils/welfare'

/**
 * 获取指定周前一周的周一日期
 */
function getPreviousWeekStart(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() - 7)
  return getWeekStart(d)
}

/**
 * 从排名列表聚合汇总数据
 */
function aggregate(ranking: {
  personnelId: number
  sg: number
  mx: number
  qm: number
  totalWelfare: number
}[]) {
  return {
    personnelCount: ranking.length,
    totalSG: ranking.reduce((s, r) => s + r.sg, 0),
    totalMX: ranking.reduce((s, r) => s + r.mx, 0),
    totalQM: ranking.reduce((s, r) => s + r.qm, 0),
    totalWelfare: ranking.reduce((s, r) => s + r.totalWelfare, 0),
  }
}

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /api/dashboard/summary - 本周汇总
  fastify.get(
    '/api/dashboard/summary',
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

      return reply.send(aggregate(ranking))
    }
  )

  // GET /api/dashboard/top3 - Top3排名
  fastify.get(
    '/api/dashboard/top3',
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

      // 返回每个分部的前3名
      const top3 = ranking.filter((r) => r.rank <= 3)

      return reply.send(top3)
    }
  )

  // GET /api/dashboard/compare - 周对比（本周与上周）
  fastify.get(
    '/api/dashboard/compare',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam } =
        request.query as { weekStart?: string; branchId?: string }

      const weekStart = weekStartParam
        ? getWeekStart(new Date(weekStartParam))
        : getWeekStart()
      const lastWeekStart = getPreviousWeekStart(weekStart)

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const [thisWeekRanking, lastWeekRanking] = await Promise.all([
        computeRanking(weekStart, branchFilter),
        computeRanking(lastWeekStart, branchFilter),
      ])

      return reply.send({
        thisWeek: {
          weekStart,
          ...aggregate(thisWeekRanking),
        },
        lastWeek: {
          weekStart: lastWeekStart,
          ...aggregate(lastWeekRanking),
        },
      })
    }
  )
}
