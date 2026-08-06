import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { StatCycle } from '../../generated/prisma/client'
import { computeRanking, resolveCycle } from '../utils/welfare'

/**
 * 公开接口：无需登录认证，提供给所有人查看排名
 * 仅暴露查询能力，不暴露任何修改/删除/账户相关数据
 */

async function resolveCycleParam(
  cycleParam: string | undefined,
  branchFilter: number | undefined
): Promise<StatCycle> {
  if (cycleParam === 'MONTH') return StatCycle.MONTH
  if (cycleParam === 'WEEK') return StatCycle.WEEK
  return resolveCycle(branchFilter)
}

export default async function publicRoutes(fastify: FastifyInstance) {
  // GET /api/public/branches - 公开查询厅列表（仅返回 id/name/statCycle，不含统计计数）
  // 已关闭的厅不在公开页面显示
  fastify.get('/api/public/branches', async (_request, reply) => {
    const branches = await prisma.branch.findMany({
      where: { closed: false },
      select: { id: true, name: true, statCycle: true, groupId: true },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(branches)
  })

  // GET /api/public/branch-groups - 公开查询合厅组列表（含成员厅信息）
  // 已关闭的厅仍保留在合厅组中，但前端展示时过滤
  fastify.get('/api/public/branch-groups', async (_request, reply) => {
    const groups = await prisma.branchGroup.findMany({
      include: {
        branches: {
          select: { id: true, name: true, statCycle: true, closed: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(groups)
  })

  // GET /api/public/weeks - 公开查询历史周列表（已关闭的厅不显示）
  // 支持 branchGroupId 参数：合厅组模式查询组内所有厅的周列表
  fastify.get('/api/public/weeks', async (request, reply) => {
    const { branchId: branchIdParam, branchGroupId: groupIdParam } = request.query as {
      branchId?: string
      branchGroupId?: string
    }
    const branchFilter = branchIdParam ? Number(branchIdParam) : undefined
    const groupFilter = groupIdParam ? Number(groupIdParam) : undefined

    // 合厅组模式：查询组内所有未关闭厅的周列表
    if (groupFilter && !Number.isNaN(groupFilter)) {
      const group = await prisma.branchGroup.findUnique({
        where: { id: groupFilter },
        include: { branches: { select: { id: true, closed: true } } },
      })
      if (!group) return reply.send([])
      const memberIds = group.branches.filter((b) => !b.closed).map((b) => b.id)
      if (memberIds.length === 0) return reply.send([])
      const records = await prisma.dataRecord.findMany({
        where: { branchId: { in: memberIds } },
        select: { weekStart: true },
        distinct: ['weekStart'],
        orderBy: { weekStart: 'desc' },
      })
      return reply.send(records.map((r) => r.weekStart))
    }

    // 指定单厅时校验是否已关闭
    if (branchFilter && !Number.isNaN(branchFilter)) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchFilter },
        select: { closed: true },
      })
      if (!branch || branch.closed) {
        return reply.send([])
      }
    }

    const records = await prisma.dataRecord.findMany({
      where: branchFilter && !Number.isNaN(branchFilter)
        ? { branchId: branchFilter }
        : { branch: { closed: false } },
      select: { weekStart: true },
      distinct: ['weekStart'],
      orderBy: { weekStart: 'desc' },
    })

    return reply.send(records.map((r) => r.weekStart))
  })

  // GET /api/public/ranking - 公开查询周期排名
  // 全部厅时：按各厅自身统计周期分别查询后合并，确保月统计厅数据也能返回
  // 支持 branchGroupId 参数：合厅组模式聚合组内所有厅的排名
  fastify.get('/api/public/ranking', async (request, reply) => {
    const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam, branchGroupId: groupIdParam } =
      request.query as {
        weekStart?: string
        branchId?: string
        cycle?: string
        branchGroupId?: string
      }

    const refDate = weekStartParam ? new Date(weekStartParam) : new Date()
    const branchFilter =
      branchIdParam && !Number.isNaN(Number(branchIdParam)) ? Number(branchIdParam) : undefined
    const groupFilter =
      groupIdParam && !Number.isNaN(Number(groupIdParam)) ? Number(groupIdParam) : undefined

    // 合厅组模式：查询组内所有未关闭厅并合并（各厅 statCycle 一致，取首个厅周期）
    if (groupFilter) {
      const group = await prisma.branchGroup.findUnique({
        where: { id: groupFilter },
        include: { branches: { select: { id: true, statCycle: true, closed: true } } },
      })
      if (!group) return reply.send([])
      const memberBranches = group.branches.filter((b) => !b.closed)
      if (memberBranches.length === 0) return reply.send([])
      const groupCycle = memberBranches[0].statCycle
      const results = await Promise.all(
        memberBranches.map((b) => computeRanking(refDate, b.id, groupCycle))
      )
      return reply.send(results.flat())
    }

    // 指定单厅：按该厅 cycle 查询（已关闭的厅不显示）
    if (branchFilter) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchFilter },
        select: { closed: true },
      })
      if (!branch || branch.closed) {
        return reply.send([])
      }
      const cycle = await resolveCycleParam(cycleParam, branchFilter)
      const ranking = await computeRanking(refDate, branchFilter, cycle)
      return reply.send(ranking)
    }

    // 全部厅：分别按各厅 statCycle 查询，合并结果（排除已关闭的厅）
    const allBranches = await prisma.branch.findMany({
      where: { closed: false },
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
  })

  // GET /api/public/personnel - 公开查询所有人员及其所属厅（扁平化）
  // 用于搜索时显示未录入数据的人员（已关闭的厅不显示）
  fastify.get('/api/public/personnel', async (_request, reply) => {
    const branches = await prisma.branch.findMany({
      where: { closed: false },
      select: {
        id: true,
        name: true,
        statCycle: true,
        personnelBranches: {
          select: {
            personnel: { select: { id: true, name: true } },
          },
        },
      },
    })
    const result: Array<{
      personnelId: number
      personnelName: string
      branchId: number
      branchName: string
      statCycle: StatCycle
    }> = []
    for (const b of branches) {
      for (const pb of b.personnelBranches) {
        result.push({
          personnelId: pb.personnel.id,
          personnelName: pb.personnel.name,
          branchId: b.id,
          branchName: b.name,
          statCycle: b.statCycle,
        })
      }
    }
    return reply.send(result)
  })

  // GET /api/public/reward-rules - 公开查询奖励规则（已关闭的厅不显示）
  fastify.get('/api/public/reward-rules', async (request, reply) => {
    const { branchId: branchIdParam } = request.query as { branchId?: string }
    const branchFilter =
      branchIdParam && !Number.isNaN(Number(branchIdParam)) ? Number(branchIdParam) : undefined

    // 指定单厅时校验是否已关闭
    if (branchFilter) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchFilter },
        select: { closed: true },
      })
      if (!branch || branch.closed) {
        return reply.send([])
      }
    }

    const rules = await prisma.rewardRule.findMany({
      where: branchFilter
        ? { branchId: branchFilter }
        : { branch: { closed: false } },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { branchId: 'asc' },
    })

    return reply.send(rules)
  })
}
