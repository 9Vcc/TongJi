import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { Role, StatCycle } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'

interface RewardRuleLike {
  sgRatio: number
  qmRatio: number
  maixuThreshold: number
  maixuReward: number
  maixuMinStandard: number
  maixuMinEnabled: boolean
  sgEnabled: boolean
  qmEnabled: boolean
  maixuEnabled: boolean
}

/**
 * 福利计算：收光*收光系数 + 全麦*全麦系数 + 麦序达标奖励
 * 麦序最低标准门控：启用且麦序未达标则福利为0
 */
function calcWelfare(sg: number, mx: number, qm: number, rule: RewardRuleLike): number {
  if (rule.maixuMinEnabled && mx < rule.maixuMinStandard) return 0
  const sgPart = rule.sgEnabled ? sg * rule.sgRatio : 0
  const qmPart = rule.qmEnabled ? qm * rule.qmRatio : 0
  const base = sgPart + qmPart
  const maixuBonus =
    rule.maixuEnabled && mx >= rule.maixuThreshold ? rule.maixuReward : 0
  return base + maixuBonus
}

/**
 * 解析查询参数中的分部过滤
 * 会长可指定 branchId 或查看全部；超管/管理只能查看自己分部
 */
function resolveQueryBranchId(
  currentUser: { role: Role; branchId: number | null },
  requestedBranchId: string | undefined
): number | undefined {
  if (currentUser.role === Role.HUIZHANG) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      return Number.isNaN(n) ? undefined : n
    }
    return undefined
  }
  return currentUser.branchId ?? undefined
}

export default async function dataQueryRoutes(fastify: FastifyInstance) {
  // GET /api/data-records - 按周查询数据
  fastify.get(
    '/api/data-records',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam } =
        request.query as { weekStart?: string; branchId?: string }

      // 计算查询的周起始（默认本周）
      const weekStart = weekStartParam
        ? getWeekStart(new Date(weekStartParam))
        : getWeekStart()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const records = await prisma.dataRecord.findMany({
        where: {
          weekStart,
          ...(branchFilter ? { branchId: branchFilter } : {}),
        },
        include: {
          personnel: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          namings: { include: { level: { select: { name: true, reward: true } } } },
        },
        orderBy: [{ branchId: 'asc' }, { personnelId: 'asc' }],
      })

      // 获取相关分部的奖励规则
      const branchIds = [...new Set(records.map((r) => r.branchId))]
      const rules = await prisma.rewardRule.findMany({
        where: { branchId: { in: branchIds } },
      })
      const ruleMap = new Map(rules.map((r) => [r.branchId, r]))

      // 获取相关分部的统计周期（决定扣减按周还是按月匹配）
      const branches = await prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, statCycle: true },
      })
      const branchCycleMap = new Map(branches.map((b) => [b.id, b.statCycle]))

      // 查询扣减：周统计厅按 weekStart 匹配，月统计厅按 weekStart 所在月的1号匹配
      const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
      const [weekDeductions, monthDeductions] = await Promise.all([
        prisma.deduction.findMany({
          where: {
            periodStart: weekStart,
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
        }),
        prisma.deduction.findMany({
          where: {
            periodStart: monthStart,
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
        }),
      ])
      // 按 (branchId, personnelId) 索引扣减金额
      const deductionMap = new Map<string, number>()
      for (const d of weekDeductions) {
        if (branchCycleMap.get(d.branchId) === StatCycle.WEEK) {
          deductionMap.set(`${d.branchId}:${d.personnelId}`, d.amount)
        }
      }
      for (const d of monthDeductions) {
        if (branchCycleMap.get(d.branchId) === StatCycle.MONTH) {
          deductionMap.set(`${d.branchId}:${d.personnelId}`, d.amount)
        }
      }

      // 临时调试日志：确认扣减查询参数与结果
      console.log('[data-query] deduction lookup:', {
        weekStart: weekStart.toISOString(),
        monthStart: monthStart.toISOString(),
        branchFilter,
        branchCycleMap: Object.fromEntries(branchCycleMap),
        weekDeductionsCount: weekDeductions.length,
        monthDeductionsCount: monthDeductions.length,
        deductionMapEntries: [...deductionMap.entries()],
      })

      const result = records.map((r) => {
        const rule = ruleMap.get(r.branchId)
        // 冠名福利
        const namings = r.namings.map((n) => ({
          levelId: n.levelId,
          levelName: n.level.name,
          count: n.count,
          reward: n.level.reward,
        }))
        const namingWelfare = namings.reduce((s, n) => s + n.count * n.reward, 0)
        const baseWelfare = rule
          ? calcWelfare(r.sg, r.mx, r.qm, rule)
          : r.sg * 3 + r.qm * 3
        const welfare = baseWelfare + namingWelfare
        const deduction = deductionMap.get(`${r.branchId}:${r.personnelId}`) ?? 0
        return {
          id: r.id,
          personnelId: r.personnelId,
          personnelName: r.personnel.name,
          branchId: r.branchId,
          branchName: r.branch.name,
          weekStart: r.weekStart,
          sg: r.sg,
          mx: r.mx,
          qm: r.qm,
          welfare,
          deduction,
          finalWelfare: welfare - deduction,
          namings,
        }
      })

      return reply.send(result)
    }
  )

  // GET /api/weeks - 历史周列表
  fastify.get(
    '/api/weeks',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as {
        branchId?: string
      }

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const records = await prisma.dataRecord.findMany({
        where: branchFilter ? { branchId: branchFilter } : {},
        select: { weekStart: true },
        distinct: ['weekStart'],
        orderBy: { weekStart: 'desc' },
      })

      return reply.send(records.map((r) => r.weekStart))
    }
  )

  // GET /api/data-records/compare - 两周数据对比
  fastify.get(
    '/api/data-records/compare',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { week1, week2, branchId: branchIdParam } = request.query as {
        week1?: string
        week2?: string
        branchId?: string
      }

      if (!week1 || !week2) {
        return reply.code(400).send({ error: '请指定对比的两周（week1, week2）' })
      }

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const w1 = getWeekStart(new Date(week1))
      const w2 = getWeekStart(new Date(week2))

      const [records1, records2] = await Promise.all([
        prisma.dataRecord.findMany({
          where: {
            weekStart: w1,
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
          include: {
            personnel: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        }),
        prisma.dataRecord.findMany({
          where: {
            weekStart: w2,
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
          include: {
            personnel: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        }),
      ])

      // 获取相关分部奖励规则
      const branchIds = [
        ...new Set([
          ...records1.map((r) => r.branchId),
          ...records2.map((r) => r.branchId),
        ]),
      ]
      const rules = await prisma.rewardRule.findMany({
        where: { branchId: { in: branchIds } },
      })
      const ruleMap = new Map(rules.map((r) => [r.branchId, r]))

      const toView = (
        r:
          | (typeof records1)[number]
          | null
      ) => {
        if (!r) return null
        const rule = ruleMap.get(r.branchId)
        const welfare = rule
          ? calcWelfare(r.sg, r.mx, r.qm, rule)
          : r.sg * 3 + r.qm * 3
        return {
          id: r.id,
          sg: r.sg,
          mx: r.mx,
          qm: r.qm,
          welfare,
        }
      }

      // 按 (branchId, personnelId) 分组对齐两周数据
      const map = new Map<
        string,
        {
          personnelId: number
          personnelName: string
          branchId: number
          branchName: string
          week1: ReturnType<typeof toView>
          week2: ReturnType<typeof toView>
        }
      >()

      const keyOf = (branchId: number, personnelId: number) =>
        `${branchId}:${personnelId}`

      for (const r of records1) {
        const k = keyOf(r.branchId, r.personnelId)
        map.set(k, {
          personnelId: r.personnelId,
          personnelName: r.personnel.name,
          branchId: r.branchId,
          branchName: r.branch.name,
          week1: toView(r),
          week2: null,
        })
      }
      for (const r of records2) {
        const k = keyOf(r.branchId, r.personnelId)
        const existing = map.get(k)
        if (existing) {
          existing.week2 = toView(r)
        } else {
          map.set(k, {
            personnelId: r.personnelId,
            personnelName: r.personnel.name,
            branchId: r.branchId,
            branchName: r.branch.name,
            week1: null,
            week2: toView(r),
          })
        }
      }

      return reply.send([...map.values()])
    }
  )
}
