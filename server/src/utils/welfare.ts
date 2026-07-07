import prisma from '../lib/prisma'
import { Role, StatCycle } from '../../generated/prisma/client'
import {
  getPeriodStart,
  getPeriodEnd,
} from './period'
import { canAccessBranch } from '../middleware/auth'

export interface RankingItem {
  rank: number
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  sg: number
  mx: number
  qm: number
  zcDays: number
  baseWelfare: number
  zcWelfare: number
  rankReward: number
  namingWelfare: number
  deduction: number
  totalWelfare: number
  namings: { levelId: number; levelName: string; count: number; reward: number }[]
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
  // 排名奖金与麦序达标奖励是否叠加（true=前3名达标时叠加两者）
  stackRankAndMaixu: boolean
  // 主持福利：启用后按主持天数 × 每日福利计入基础福利
  zcEnabled: boolean
  zcDayReward: number
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
  stackRankAndMaixu: true,
  zcEnabled: false,
  zcDayReward: 0,
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
 * 计算主持福利：主持天数 × 每日福利（尊重 zcEnabled 开关）
 */
export function computeZcWelfare(
  zcDays: number,
  rule: RewardRuleLike
): number {
  return rule.zcEnabled ? zcDays * rule.zcDayReward : 0
}

/**
 * 计算排名奖励（排名奖金 + 麦序达标奖励）
 * - 麦序达标奖励：所有麦序达标（maixuEnabled && mx >= maixuThreshold）者均可获得 maixuReward，
 *   仅受 maixuEnabled 控制，与 rankEnabled 无关
 * - 排名奖金：仅前3名分别获得 rank1Reward/rank2Reward/rank3Reward，受 rankEnabled 控制
 *   rankEnabled=false 时排名奖金部分为 0，但不影响麦序达标奖励
 * - stackRankAndMaixu：控制前3名是否同时叠加排名奖金与麦序达标奖励
 *   true（默认）：前3名达标时 rankBonus + maixuBonus 叠加
 *   false：前3名只拿 rankBonus，不叠加 maixuBonus；rank≥4 仍可拿 maixuBonus
 */
export function computeRankReward(
  rank: number,
  mx: number,
  rule: RewardRuleLike
): number {
  // 麦序达标奖励：仅受 maixuEnabled 控制，与 rankEnabled 无关
  const maixuBonus =
    rule.maixuEnabled && mx >= rule.maixuThreshold ? rule.maixuReward : 0
  // 排名奖金：仅前3名，受 rankEnabled 控制
  let rankBonus = 0
  if (rule.rankEnabled) {
    if (rank === 1) rankBonus = rule.rank1Reward
    else if (rank === 2) rankBonus = rule.rank2Reward
    else if (rank === 3) rankBonus = rule.rank3Reward
  }
  // 叠加开关：前3名（rankBonus > 0）且关闭叠加时，不重复发放 maixuBonus
  if (rankBonus > 0 && !rule.stackRankAndMaixu) {
    return rankBonus
  }
  return rankBonus + maixuBonus
}

/**
 * 解析查询参数中的分部过滤
 * 会长可指定 branchId 或查看全部；超管可查看指定授权厅或全部授权厅；管理只能查看自己分部
 */
export function resolveQueryBranchId(
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
  // 超管：可查看指定授权厅
  if (currentUser.role === Role.CHAOGUAN) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      if (!Number.isNaN(n) && canAccessBranch(currentUser, n)) {
        return n
      }
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
 * - 前3名分别获得 rank1Reward/rank2Reward/rank3Reward 排名奖金
 * - 所有麦序≥maixuThreshold 者均获得 maixuReward（前3名达标时与排名奖金叠加）
 * - 基础福利 = sg*sgRatio + qm*qmRatio（受开关控制）
 * - 总福利 = 基础福利 + 排名奖励（排名奖金 + 麦序达标奖励）
 */
export async function computeRanking(
  refDate: Date,
  branchFilter?: number,
  cycle: StatCycle = StatCycle.WEEK
): Promise<RankingItem[]> {
  // 根据周期确定查询范围
  // WEEK: 周一到周日，精确匹配 weekStart
  // MONTH: 按厅 statCycle 区分归属逻辑
  //   - 月统计厅：weekStart 精确落在 [当月1日, 下月1日) 范围（数据存储时归一化为月初1日）
  //   - 按周统计厅：录入时间归属月（createdAt 落在目标月内），避免跨月周中上月录入的数据被算入本月
  //     例：本周 6/29(周一)-7/5(周日)，6/29 录入的属于 6 月，7/1 录入的属于 7 月
  const periodStart = getPeriodStart(cycle, refDate)
  const periodEnd = getPeriodEnd(cycle, refDate)

  let records

  if (cycle === StatCycle.MONTH) {
    const rawRecords = await prisma.dataRecord.findMany({
      where: {
        weekStart: { gte: periodStart, lt: periodEnd },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      include: {
        personnel: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, statCycle: true } },
        namings: { include: { level: true } },
      },
    })
    // 过滤：按厅 statCycle 区分归属逻辑
    // - 月统计厅（MONTH）：weekStart 落在 [当月1日, 下月1日) 范围
    // - 按周统计厅（WEEK）：按录入时间归属月，createdAt 落在目标月内才算
    records = rawRecords.filter((r) => {
      if (r.branch.statCycle === StatCycle.WEEK) {
        return r.createdAt >= periodStart && r.createdAt < periodEnd
      }
      // 月统计厅：DB 查询已按范围过滤，此处直接保留
      return true
    })
  } else {
    records = await prisma.dataRecord.findMany({
      where: {
        weekStart: periodStart,
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      include: {
        personnel: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        namings: { include: { level: true } },
      },
    })
  }

  if (records.length === 0) return []

  // 获取相关分部的奖励规则
  const branchIds = [...new Set(records.map((r) => r.branchId))]
  const rules = await prisma.rewardRule.findMany({
    where: { branchId: { in: branchIds } },
  })
  const ruleMap = new Map(rules.map((r) => [r.branchId, r]))

  // 获取各厅冠名等级（构建 levelId -> { name, reward } 映射）
  const namingLevels = await prisma.namingLevel.findMany({
    where: { branchId: { in: branchIds } },
  })
  const levelInfoMap = new Map(namingLevels.map((l) => [l.id, { name: l.name, reward: l.reward }]))

  // 查询扣减：按 cycle 决定 periodStart（周=周一，月=月初1号）
  const deductions = await prisma.deduction.findMany({
    where: {
      periodStart,
      ...(branchFilter ? { branchId: branchFilter } : {}),
    },
  })
  // 按 (branchId, personnelId) 索引扣减金额
  const deductionMap = new Map<string, number>()
  for (const d of deductions) {
    deductionMap.set(`${d.branchId}:${d.personnelId}`, d.amount)
  }

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
        zcDays: number
        namings: Map<number, number> // levelId -> count
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
      existing.zcDays += r.zcDays
      for (const n of r.namings) {
        existing.namings.set(n.levelId, (existing.namings.get(n.levelId) ?? 0) + n.count)
      }
    } else {
      const namingsMap = new Map<number, number>()
      for (const n of r.namings) {
        namingsMap.set(n.levelId, (namingsMap.get(n.levelId) ?? 0) + n.count)
      }
      branchMap.set(r.personnelId, {
        personnelName: r.personnel.name,
        branchName: r.branch.name,
        sg: r.sg,
        mx: r.mx,
        qm: r.qm,
        zcDays: r.zcDays,
        namings: namingsMap,
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
      const zcWelfare = maixuDisqualified
        ? 0
        : computeZcWelfare(p.zcDays, rule)
      const rankReward = maixuDisqualified
        ? 0
        : computeRankReward(rank, p.mx, rule)

      // 冠名福利：各等级冠名数 × 对应等级福利
      const namings: { levelId: number; levelName: string; count: number; reward: number }[] = []
      let namingWelfare = 0
      for (const [levelId, count] of p.namings) {
        if (count <= 0) continue
        const info = levelInfoMap.get(levelId)
        if (!info) continue
        namings.push({ levelId, levelName: info.name, count, reward: info.reward })
        namingWelfare += count * info.reward
      }

      result.push({
        rank,
        personnelId: p.personnelId,
        personnelName: p.personnelName,
        branchId,
        branchName: p.branchName,
        sg: p.sg,
        mx: p.mx,
        qm: p.qm,
        zcDays: p.zcDays,
        baseWelfare,
        zcWelfare,
        rankReward,
        namingWelfare,
        deduction: deductionMap.get(`${branchId}:${p.personnelId}`) ?? 0,
        totalWelfare: Math.max(0, baseWelfare + zcWelfare + rankReward + namingWelfare - (deductionMap.get(`${branchId}:${p.personnelId}`) ?? 0)),
        namings,
      })
    })
  }

  return result
}
