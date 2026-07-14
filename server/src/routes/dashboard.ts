import type { FastifyInstance } from 'fastify'
import { authenticate, canAccessBranch, canAccessGroup, getAccessibleBranchIds } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
import prisma from '../lib/prisma'
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
 * - 超管：可查看指定授权厅，未指定时返回 undefined（由调用方用 branchIds 过滤）
 * - 管理：始终限定本厅
 */
function resolveDashboardBranchId(
  currentUser: { role: Role; branchId: number | null; branchIds: number[] },
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

/**
 * 按用户权限计算排名
 * - 指定单厅：直接调用 computeRanking
 * - 指定合厅组：查询组内所有厅并合并
 * - 全部厅：会长查所有厅，超管仅查授权厅（分别查询后合并）
 */
async function computeRankingForUser(
  refDate: Date,
  branchFilter: number | undefined,
  groupFilter: number | undefined,
  cycle: StatCycle,
  currentUser: { role: Role; branchId: number | null; branchIds: number[]; groupIds: number[] }
) {
  // 合厅组模式：查询组内所有厅并合并
  if (groupFilter) {
    const group = await prisma.branchGroup.findUnique({
      where: { id: groupFilter },
      include: { branches: { select: { id: true, statCycle: true } } },
    })
    if (!group || group.branches.length === 0) return []
    // 合厅组内所有厅 statCycle 一致，取第一个厅的周期
    const groupCycle = group.branches[0].statCycle
    const results = await Promise.all(
      group.branches.map((b) => computeRanking(refDate, b.id, groupCycle))
    )
    return results.flat()
  }

  if (branchFilter) {
    return computeRanking(refDate, branchFilter, cycle)
  }
  // 全部厅：会长查所有厅，超管仅查授权厅
  const accessibleIds = getAccessibleBranchIds(currentUser)
  if (accessibleIds === null) {
    // 会长：查所有厅
    return computeRanking(refDate, undefined, cycle)
  }
  if (accessibleIds.length === 0) return []
  // 超管：分别查询各授权厅后合并
  const results = await Promise.all(
    accessibleIds.map((id) => computeRanking(refDate, id, cycle))
  )
  return results.flat()
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

/**
 * 解析合厅组参数：校验权限并返回 groupFilter
 */
async function resolveGroupFilter(
  currentUser: { role: Role; groupIds: number[] },
  groupParam: string | undefined
): Promise<number | undefined> {
  if (!groupParam) return undefined
  const groupId = Number(groupParam)
  if (Number.isNaN(groupId)) return undefined
  if (!canAccessGroup(currentUser, groupId)) return undefined
  return groupId
}

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /api/dashboard/summary - 本期汇总（按厅统计周期，全部厅默认按月）
  fastify.get(
    '/api/dashboard/summary',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll, branchGroupId: groupParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string; branchGroupId?: string }

      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
      const groupFilter = await resolveGroupFilter(currentUser, groupParam)
      const branchFilter = resolveDashboardBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      const ranking = await computeRankingForUser(refDate, branchFilter, groupFilter, cycle, currentUser)

      return reply.send(aggregate(ranking))
    }
  )

  // GET /api/dashboard/top3 - Top3排名（按厅统计周期，全部厅默认按月）
  fastify.get(
    '/api/dashboard/top3',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll, branchGroupId: groupParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string; branchGroupId?: string }

      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
      const groupFilter = await resolveGroupFilter(currentUser, groupParam)
      const branchFilter = resolveDashboardBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      const ranking = await computeRankingForUser(refDate, branchFilter, groupFilter, cycle, currentUser)

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
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, viewAll, branchGroupId: groupParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string; viewAll?: string; branchGroupId?: string }

      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
      const groupFilter = await resolveGroupFilter(currentUser, groupParam)
      const branchFilter = resolveDashboardBranchId(currentUser, branchIdParam, viewAll)
      const cycle = await resolveCycleParam(cycleParam, branchFilter)

      // 本期与上期起始日
      const thisPeriodStart = getPeriodStart(cycle, refDate)
      const lastPeriodStart = getPreviousPeriodStart(cycle, refDate)

      const [thisPeriodRanking, lastPeriodRanking] = await Promise.all([
        computeRankingForUser(refDate, branchFilter, groupFilter, cycle, currentUser),
        computeRankingForUser(lastPeriodStart, branchFilter, groupFilter, cycle, currentUser),
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
