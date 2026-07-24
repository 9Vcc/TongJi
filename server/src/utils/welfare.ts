import prisma from '../lib/prisma'
import { StatCycle } from '../../generated/prisma/client'
import {
  getPeriodStart,
  getPeriodEnd,
} from './period'
import { toDecimal2 } from './validation'
// resolveQueryBranchId 已抽取到 ./branch，此处重新导出以保持向后兼容
// （export.ts、notifications.ts 仍从此处导入）
export { resolveQueryBranchId } from './branch'

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
  // 排名奖金（仅前3名，受 rankEnabled 控制）
  rankBonus: number
  // 麦序达标奖励（受 maixuEnabled 控制）
  maixuBonus: number
  // 排名奖励合计 = rankBonus + maixuBonus（考虑叠加开关后）
  rankReward: number
  namingWelfare: number
  deduction: number
  totalWelfare: number
  // 无福利标记：true 表示该周期被标记，福利清零（扣减仍生效）
  noWelfare: boolean
  // 无福利标记备注
  noWelfareRemark: string | null
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
 * 计算排名奖金（仅前3名，受 rankEnabled 控制）
 */
export function computeRankBonus(rank: number, rule: RewardRuleLike): number {
  if (!rule.rankEnabled) return 0
  if (rank === 1) return rule.rank1Reward
  if (rank === 2) return rule.rank2Reward
  if (rank === 3) return rule.rank3Reward
  return 0
}

/**
 * 计算麦序达标奖励（受 maixuEnabled 控制，与 rankEnabled 无关）
 */
export function computeMaixuBonus(mx: number, rule: RewardRuleLike): number {
  return rule.maixuEnabled && mx >= rule.maixuThreshold ? rule.maixuReward : 0
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
  const rankBonus = computeRankBonus(rank, rule)
  const maixuBonus = computeMaixuBonus(mx, rule)
  // 叠加开关：前3名（rankBonus > 0）且关闭叠加时，不重复发放 maixuBonus
  if (rankBonus > 0 && !rule.stackRankAndMaixu) {
    return rankBonus
  }
  return rankBonus + maixuBonus
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
    // - 月统计厅（MONTH）：只保留 weekStart=月初1日 的记录
    //   （月统计厅录入时 weekStart 归一化为月初1日，与数据录入页查询逻辑一致，
    //    避免异常/历史多 weekStart 记录导致冠名等数据重复累加）
    // - 按周统计厅（WEEK）：按录入时间归属月，createdAt 落在目标月内才算
    records = rawRecords.filter((r) => {
      if (r.branch.statCycle === StatCycle.WEEK) {
        return r.createdAt >= periodStart && r.createdAt < periodEnd
      }
      // 月统计厅：只保留 weekStart 恰好为月初1日的记录
      const ws = new Date(r.weekStart)
      ws.setHours(0, 0, 0, 0)
      return ws.getTime() === periodStart.getTime()
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

  // 获取相关分部的奖励规则、冠名等级、扣减、无福利标记（四者互不依赖，并行查询）
  const branchIds = [...new Set(records.map((r) => r.branchId))]
  const [rules, namingLevels, deductions, noWelfareMarks] = await Promise.all([
    prisma.rewardRule.findMany({
      where: { branchId: { in: branchIds } },
    }),
    prisma.namingLevel.findMany({
      where: { branchId: { in: branchIds } },
    }),
    // 查询扣减：按 cycle 决定 periodStart（周=周一，月=月初1号）
    prisma.deduction.findMany({
      where: {
        periodStart,
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
    }),
    // 查询无福利标记：按 cycle 决定 periodStart（与扣减一致）
    prisma.noWelfareMark.findMany({
      where: {
        periodStart,
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
    }),
  ])
  const ruleMap = new Map(rules.map((r) => [r.branchId, r]))
  const levelInfoMap = new Map(namingLevels.map((l) => [l.id, { name: l.name, reward: Number(l.reward) }]))
  // 按 (branchId, personnelId) 索引扣减金额
  const deductionMap = new Map<string, number>()
  for (const d of deductions) {
    deductionMap.set(`${d.branchId}:${d.personnelId}`, d.amount)
  }
  // 按 (branchId, personnelId) 索引无福利标记及其备注
  const noWelfareMap = new Map<string, { marked: boolean; remark: string | null }>()
  for (const m of noWelfareMarks) {
    noWelfareMap.set(`${m.branchId}:${m.personnelId}`, { marked: true, remark: m.remark })
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
      // 无福利标记：标记后福利清零（扣减仍生效，最终福利 = max(0, 0 - deduction) = 0）
      const noWelfareEntry = noWelfareMap.get(`${branchId}:${p.personnelId}`)
      const noWelfare = !!noWelfareEntry?.marked
      const noWelfareRemark = noWelfareEntry?.remark ?? null
      const baseWelfare = (maixuDisqualified || noWelfare)
        ? 0
        : computeBaseWelfare(p.sg, p.qm, rule)
      const zcWelfare = (maixuDisqualified || noWelfare)
        ? 0
        : computeZcWelfare(p.zcDays, rule)
      // 排名奖金与麦序达标奖励分别计算（受 maixuDisqualified / noWelfare 门控）
      const rankBonus = (maixuDisqualified || noWelfare) ? 0 : computeRankBonus(rank, rule)
      let maixuBonus = (maixuDisqualified || noWelfare) ? 0 : computeMaixuBonus(p.mx, rule)
      // 叠加开关：前3名（rankBonus > 0）且关闭叠加时，不重复发放 maixuBonus
      if (rankBonus > 0 && !rule.stackRankAndMaixu) {
        maixuBonus = 0
      }
      const rankReward = rankBonus + maixuBonus

      // 冠名福利：各等级冠名数 × 对应等级福利
      // 麦序最低标准未达标/无福利标记：无任何福利（含冠名福利）
      const namings: { levelId: number; levelName: string; count: number; reward: number }[] = []
      let namingWelfare = 0
      if (!maixuDisqualified && !noWelfare) {
        for (const [levelId, count] of p.namings) {
          if (count <= 0) continue
          const info = levelInfoMap.get(levelId)
          if (!info) continue
          namings.push({ levelId, levelName: info.name, count, reward: info.reward })
          namingWelfare += count * info.reward
        }
      } else {
        // 未达标/无福利：仍展示冠名明细（count > 0 的），但不计福利
        for (const [levelId, count] of p.namings) {
          if (count <= 0) continue
          const info = levelInfoMap.get(levelId)
          if (!info) continue
          namings.push({ levelId, levelName: info.name, count, reward: info.reward })
        }
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
        rankBonus,
        maixuBonus,
        rankReward,
        namingWelfare: toDecimal2(namingWelfare),
        deduction: deductionMap.get(`${branchId}:${p.personnelId}`) ?? 0,
        totalWelfare: Math.max(0, toDecimal2(baseWelfare + zcWelfare + rankReward + namingWelfare - (deductionMap.get(`${branchId}:${p.personnelId}`) ?? 0))),
        noWelfare,
        noWelfareRemark,
        namings,
      })
    })
  }

  return result
}
