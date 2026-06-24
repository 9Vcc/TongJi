import prisma from '../lib/prisma'
import { Role } from '../../generated/prisma/client'

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
}

/**
 * 计算基础福利：收光 × 收光比例 + 全麦 × 全麦比例
 */
export function computeBaseWelfare(
  sg: number,
  qm: number,
  rule: RewardRuleLike
): number {
  return sg * rule.sgRatio + qm * rule.qmRatio
}

/**
 * 计算排名奖励
 * - 第1名：rank1Reward
 * - 第2名：rank2Reward
 * - 第3名：rank3Reward
 * - 第4名及以后：若麦序 ≥ maixuThreshold 则获得 maixuReward，否则 0
 */
export function computeRankReward(
  rank: number,
  mx: number,
  rule: RewardRuleLike
): number {
  if (rank === 1) return rule.rank1Reward
  if (rank === 2) return rule.rank2Reward
  if (rank === 3) return rule.rank3Reward
  if (mx >= rule.maixuThreshold) return rule.maixuReward
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
 * 计算指定周的排名与福利
 * 排名按分部分组，每个分部内按麦序(mx)降序排列
 * - 前3名分别获得 rank1Reward/rank2Reward/rank3Reward
 * - 麦序≥maixuThreshold 但未进前3者获得 maixuReward
 * - 基础福利 = sg*sgRatio + qm*qmRatio
 * - 总福利 = 基础福利 + 排名奖励
 */
export async function computeRanking(
  weekStart: Date,
  branchFilter?: number
): Promise<RankingItem[]> {
  const records = await prisma.dataRecord.findMany({
    where: {
      weekStart,
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

  // 按分部分组
  const byBranch = new Map<number, typeof records>()
  for (const r of records) {
    const arr = byBranch.get(r.branchId) ?? []
    arr.push(r)
    byBranch.set(r.branchId, arr)
  }

  const result: RankingItem[] = []
  const sortedBranchIds = [...byBranch.keys()].sort((a, b) => a - b)

  for (const branchId of sortedBranchIds) {
    const branchRecords = byBranch.get(branchId)!
    // 按麦序降序，相同麦序按人员ID升序保持稳定
    branchRecords.sort((a, b) => b.mx - a.mx || a.personnelId - b.personnelId)

    const rule = ruleMap.get(branchId) ?? DEFAULT_RULE
    branchRecords.forEach((r, idx) => {
      const rank = idx + 1
      const baseWelfare = computeBaseWelfare(r.sg, r.qm, rule)
      const rankReward = computeRankReward(rank, r.mx, rule)

      result.push({
        rank,
        personnelId: r.personnelId,
        personnelName: r.personnel.name,
        branchId: r.branchId,
        branchName: r.branch.name,
        sg: r.sg,
        mx: r.mx,
        qm: r.qm,
        baseWelfare,
        rankReward,
        totalWelfare: baseWelfare + rankReward,
      })
    })
  }

  return result
}
