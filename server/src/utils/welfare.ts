import prisma from '../lib/prisma'
import { Role, StatCycle } from '../../generated/prisma/client'
import {
  getPeriodStart,
  getPeriodEnd,
} from './period'

export interface RankingItem {
  rank: number
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  sg: number
  mx: number
  qm: number
  baseWelfare: number
  rankReward: number
  totalWelfare: number
}

interface RewardRuleLike {
  sgRatio: number
  qmRatio: number
  rank1Reward: number
  rank2Reward: number
  rank3Reward: number
  maixuThreshold: number
  maixuReward: number
  maixuMinStandard: number
  maixuMinEnabled: boolean
  sgEnabled: boolean
  qmEnabled: boolean
  rankEnabled: boolean
  maixuEnabled: boolean
}

// 默认奖励规则（分部未配置时使用，与 schema 默认值一致）
const DEFAULT_RULE: RewardRuleLike = {
  sgRatio: 3,
  qmRatio: 3,
  rank1Reward: 100,
  rank2Reward: 80,
  rank3Reward: 60,
  maixuThreshold: 40,
  maixuReward: 52,
  maixuMinStandard: 0,
  maixuMinEnabled: false,
  sgEnabled: true,
  qmEnabled: true,
  rankEnabled: true,
  maixuEnabled: true,
}

/**
 * 计算基础福利：收光 × 收光比例 + 全麦 × 全麦比例
 * 尊重开关：sgEnabled=false 时收光部分不计；qmEnabled=false 时全麦部分不计
 */
export function computeBaseWelfare(
  sg: number,
  qm: number,
  rule: RewardRuleLike
): number {
  const sgPart = rule.sgEnabled ? sg * rule.sgRatio : 0
  const qmPart = rule.qmEnabled ? qm * rule.qmRatio : 0
  return sgPart + qmPart
}

/**
 * 计算排名奖励
 * - rankEnabled=false：排名奖励整体关闭，返回 0
 * - 第1名：rank1Reward
 * - 第2名：rank2Reward
 * - 第3名：rank3Reward
 * - 第4名及以后：若 maixuEnabled 且麦序 ≥ maixuThreshold 则获得 maixuReward，否则 0
 */
export function computeRankReward(
  rank: number,
  mx: number,
  rule: RewardRuleLike
): number {
  if (!rule.rankEnabled) return 0
  if (rank === 1) return rule.rank1Reward
  if (rank === 2) return rule.rank2Reward
  if (rank === 3) return rule.rank3Reward
  if (rule.maixuEnabled && mx >= rule.maixuThreshold) return rule.maixuReward
  return 0
}

/**
 * 解析查询参数中的分部过滤
 * 会长可指定 branchId 或查看全部；超管/管理只能查看自己分部
 */
export function resolveQueryBranchId(
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

/**
 * 根据分部过滤解析统计周期
 * - 未指定分部（全部厅）：统一按周（混合周期场景下保证一致性）
 * - 指定单厅：按该厅的 statCycle
 */
export async function resolveCycle(
  branchFilter?: number
): Promise<StatCycle> {
  if (!branchFilter) return StatCycle.WEEK
  const b = await prisma.branch.findUnique({
    where: { id: branchFilter },
    select: { statCycle: true },
  })
  return b?.statCycle ?? StatCycle.WEEK
}

/**
 * 计算指定周期的排名与福利
 * - cycle=WEEK（默认）：按 refDate 所在周精确匹配 weekStart
 * - cycle=MONTH：按 refDate 所在月范围聚合所有周记录（sg/mx/qm 求和）后排名
 *
 * 排名按分部分组，每个分部内按麦序(mx)降序排列
 * - 前3名分别获得 rank1Reward/rank2Reward/rank3Reward
 * - 麦序≥maixuThreshold 但未进前3者获得 maixuReward
 * - 基础福利 = sg*sgRatio + qm*qmRatio（受开关控制）
 * - 总福利 = 基础福利 + 排名奖励
 */
export async function computeRanking(
  refDate: Date,
  branchFilter?: number,
  cycle: StatCycle = StatCycle.WEEK
): Promise<RankingItem[]> {
  // 根据周期确定查询范围
  const periodStart = getPeriodStart(cycle, refDate)
  const periodEnd = getPeriodEnd(cycle, refDate)

  const records = await prisma.dataRecord.findMany({
    where: {
      ...(cycle === StatCycle.MONTH
        ? { weekStart: { gte: periodStart, lt: periodEnd } }
        : { weekStart: periodStart }),
      ...(branchFilter ? { branchId: branchFilter } : {}),
    },
    include: {
      personnel: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  })

  if (records.length === 0) return []

  // 获取相关分部的奖励规则
  const branchIds = [...new Set(records.map((r) => r.branchId))]
  const rules = await prisma.rewardRule.findMany({
    where: { branchId: { in: branchIds } },
  })
  const ruleMap = new Map(rules.map((r) => [r.branchId, r]))

  // 月模式：按 (branchId, personnelId) 聚合求和
  // 周模式：每条记录已是单人员单周，无需聚合（用 Map 统一处理也兼容）
  const byBranchPersonnel = new Map<
    number, // branchId
    Map<
      number, // personnelId
      {
        personnelName: string
        branchName: string
        sg: number
        mx: number
        qm: number
      }
    >
  >()

  for (const r of records) {
    let branchMap = byBranchPersonnel.get(r.branchId)
    if (!branchMap) {
      branchMap = new Map()
      byBranchPersonnel.set(r.branchId, branchMap)
    }
    const existing = branchMap.get(r.personnelId)
    if (existing) {
      existing.sg += r.sg
      existing.mx += r.mx
      existing.qm += r.qm
    } else {
      branchMap.set(r.personnelId, {
        personnelName: r.personnel.name,
        branchName: r.branch.name,
        sg: r.sg,
        mx: r.mx,
        qm: r.qm,
      })
    }
  }

  const result: RankingItem[] = []
  const sortedBranchIds = [...byBranchPersonnel.keys()].sort((a, b) => a - b)

  for (const branchId of sortedBranchIds) {
    const branchMap = byBranchPersonnel.get(branchId)!
    const personnelList = [...branchMap.entries()].map(
      ([personnelId, d]) => ({ personnelId, ...d })
    )
    // 按麦序降序，相同麦序按人员ID升序保持稳定
    personnelList.sort(
      (a, b) => b.mx - a.mx || a.personnelId - b.personnelId
    )

    const rule = ruleMap.get(branchId) ?? DEFAULT_RULE
    personnelList.forEach((p, idx) => {
      const rank = idx + 1
      // 麦序最低标准门控：启用且麦序未达标则不计任何福利
      const maixuDisqualified =
        rule.maixuMinEnabled && p.mx < rule.maixuMinStandard
      const baseWelfare = maixuDisqualified
        ? 0
        : computeBaseWelfare(p.sg, p.qm, rule)
      const rankReward = maixuDisqualified
        ? 0
        : computeRankReward(rank, p.mx, rule)

      result.push({
        rank,
        personnelId: p.personnelId,
        personnelName: p.personnelName,
        branchId,
        branchName: p.branchName,
        sg: p.sg,
        mx: p.mx,
        qm: p.qm,
        baseWelfare,
        rankReward,
        totalWelfare: baseWelfare + rankReward,
      })
    })
  }

  return result
}
