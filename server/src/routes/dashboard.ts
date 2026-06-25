import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
import {
  computeRanking,
  resolveCycle,
} from '../utils/welfare'
import { getPeriodStart, getPreviousPeriodStart } from '../utils/period'

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
 * 解析看板查询的分部过滤
 * - 会长：可指定任意厅或全部厅
 * - 超管/管理：始终限定本厅；viewAll=true 时仅切换为按月统计本厅数据
 */
function resolveDashboardBranchId(
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
  // GET /api/dashboard/summary - 本期汇总（按厅统计周期，全部厅默认按月）
  fastify.get(
    '/api/dashboard/summary',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string }

      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
      const branchFilter = resolveDashboardBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      const ranking = await computeRanking(refDate, branchFilter, cycle)

      return reply.send(aggregate(ranking))
    }
  )

  // GET /api/dashboard/top3 - Top3排名（按厅统计周期，全部厅默认按月）
  fastify.get(
    '/api/dashboard/top3',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string }

      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
      const branchFilter = resolveDashboardBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      const ranking = await computeRanking(refDate, branchFilter, cycle)

      // 返回每个分部的前3名
      const top3 = ranking.filter((r) => r.rank <= 3)

      return reply.send(top3)
    }
  )

  // GET /api/dashboard/compare - 周期对比（本期与上期，全部厅默认按月）
  fastify.get(
    '/api/dashboard/compare',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string }

      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
      const branchFilter = resolveDashboardBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      // 本期与上期起始日
      const thisPeriodStart = getPeriodStart(cycle, refDate)
      const lastPeriodStart = getPreviousPeriodStart(cycle, refDate)

      const [thisPeriodRanking, lastPeriodRanking] = await Promise.all([
        computeRanking(refDate, branchFilter, cycle),
        computeRanking(lastPeriodStart, branchFilter, cycle),
      ])

      return reply.send({
        thisWeek: {
          weekStart: thisPeriodStart,
          ...aggregate(thisPeriodRanking),
        },
        lastWeek: {
          weekStart: lastPeriodStart,
          ...aggregate(lastPeriodRanking),
        },
      })
    }
  )
}
