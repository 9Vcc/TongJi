import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  rankingApi,
  rewardRulesApi,
  dataQueryApi,
  branchesApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { usePeriodNavigator } from '../hooks/usePeriodNavigator'
import {
  formatDate,
  getWeekRangeText,
  getMonthRangeText,
  rankBadgeColors,
  rankRowBg,
  formatNamings,
} from '../utils'
import { Skeleton } from '../components/Skeleton'
import type {
  RankingItem,
  RewardRule,
  Branch,
  StatCycle,
} from '../types'

export default function Ranking() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canSelectBranch = isHuizhang || isChaoguan

  const [branches, setBranches] = useState<Branch[]>([])
  // 会长默认全部厅(undefined)；超管/管理锁定本厅
  const [branchId, setBranchId] = useState<number | undefined>(() =>
    canSelectBranch ? undefined : user?.branchId ?? undefined
  )

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => {})
  }, [])

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branches, branchId]
  )
  const currentCycle: StatCycle = selectedBranch?.statCycle ?? 'WEEK'

  // 可用厅列表：过滤已关闭的厅
  const openBranches = useMemo(
    () => branches.filter((b) => !b.closed),
    [branches]
  )

  return (
    <div className="space-y-5">
      {/* 顶部选择器：仅厅选择（日期选择已整合到卡片） */}
      {canSelectBranch && (
        <div className="flex items-center justify-end">
          <select
            value={branchId ?? ''}
            onChange={(e) =>
              setBranchId(e.target.value ? Number(e.target.value) : undefined)
            }
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
          >
            <option value="">{isHuizhang ? '全部厅' : '全部授权厅'}</option>
            {openBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.statCycle === 'MONTH' ? '（按月）' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 排名区域 */}
      {!branchId ? (
        // 全部厅模式：每个厅一个独立卡片，含独立日期选择
        branches.length === 0 ? (
          <RankingCardSkeleton />
        ) : openBranches.length === 0 ? (
          <div className="py-12 text-center text-textMuted">暂无可用厅</div>
        ) : openBranches.length === 1 ? (
          // 只有一个厅时：卡片占满宽度
          <BranchRankingCard branch={openBranches[0]} toast={toast} />
        ) : (
          // 多个厅时：双列网格
          <div className="grid gap-5 lg:grid-cols-2">
            {openBranches.map((b) => (
              <BranchRankingCard key={b.id} branch={b} toast={toast} />
            ))}
          </div>
        )
      ) : selectedBranch ? (
        // 单厅模式：单卡片占满宽度
        <BranchRankingCard branch={selectedBranch} toast={toast} />
      ) : (
        // 厅列表加载中
        <RankingCardSkeleton />
      )}

      {/* 福利计算说明：仅在选择具体厅时显示 */}
      {branchId && selectedBranch && (
        <WelfareRuleCard branchId={branchId} isMonthCycle={currentCycle === 'MONTH'} />
      )}
    </div>
  )
}

/**
 * 厅排名卡片：含独立日期选择器和排名表格
 */
function BranchRankingCard({
  branch,
  toast,
}: {
  branch: Branch
  toast: ReturnType<typeof useToast>
}) {
  const [weeks, setWeeks] = useState<string[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [rules, setRules] = useState<RewardRule[]>([])
  const [loading, setLoading] = useState(false)

  const {
    weekStart,
    setWeekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
    availableWeeks,
    availableMonths,
    selectedMonthRef,
    isMonthCycle,
  } = usePeriodNavigator({ branch, availableWeeks: weeks })

  // 全麦是否计入：依据该厅奖励规则 qmEnabled，未加载完成前默认显示
  const qmEnabled = useMemo(() => {
    const rule = rules.find((r) => r.branchId === branch.id)
    return rule ? rule.qmEnabled : true
  }, [rules, branch.id])

  // 主持福利是否开启
  const zcEnabled = useMemo(() => {
    const rule = rules.find((r) => r.branchId === branch.id)
    return rule ? rule.zcEnabled : false
  }, [rules, branch.id])

  useEffect(() => {
    dataQueryApi.getWeeks(branch.id).then(setWeeks).catch(() => {})
    rewardRulesApi.get(branch.id).then(setRules).catch(() => {})
  }, [branch.id])

  useEffect(() => {
    setLoading(true)
    rankingApi
      .getRanking(formatDate(weekStart), branch.id)
      .then(setRanking)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branch.id])

  const top10 = useMemo(() => ranking.slice(0, 10), [ranking])

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* 卡片头部：厅名 + 周期标签 */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border flex-wrap">
        <Trophy size={18} className="text-warning" />
        <h3 className="text-base font-semibold text-textPrimary">{branch.name}</h3>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            isMonthCycle
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          }`}
        >
          {isMonthCycle ? '按月统计' : '按周统计'}
        </span>
      </div>
      {/* 日期选择器 */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
        <button
          onClick={handlePrev}
          className="p-1.5 border border-border rounded-md bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          aria-label={isMonthCycle ? '上一月' : '上一周'}
        >
          <ChevronLeft size={14} />
        </button>
        {isMonthCycle ? (
          <select
            value={selectedMonthRef}
            onChange={(e) => setWeekStart(new Date(e.target.value))}
            aria-label="选择月份"
            className="px-2.5 py-1.5 border border-border rounded-md bg-card text-sm text-textPrimary focus:outline-none focus:border-primary min-w-[200px] cursor-pointer"
          >
            {availableMonths.map((m) => (
              <option key={m.key} value={m.ref}>
                {getMonthRangeText(m.ref)}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={formatDate(weekStart)}
            onChange={(e) => setWeekStart(new Date(e.target.value))}
            aria-label="选择周次"
            className="px-2.5 py-1.5 border border-border rounded-md bg-card text-sm text-textPrimary focus:outline-none focus:border-primary min-w-[200px] cursor-pointer"
          >
            {availableWeeks.map((w) => (
              <option key={w} value={w}>
                {getWeekRangeText(w)}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={handleNext}
          className="p-1.5 border border-border rounded-md bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          aria-label={isMonthCycle ? '下一月' : '下一周'}
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={handleThisPeriod}
          className="px-2.5 py-1.5 border border-border rounded-md bg-card text-xs text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
        >
          {isMonthCycle ? '本月' : '本周'}
        </button>
      </div>
      {/* 排名表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr className="text-left text-textSecondary">
              <th className="px-3 py-2 font-medium">排名</th>
              <th className="px-3 py-2 font-medium">人员</th>
              <th className="px-3 py-2 font-medium">收光</th>
              <th className="px-3 py-2 font-medium">麦序</th>
              {qmEnabled && (
                <th className="px-3 py-2 font-medium">全麦</th>
              )}
              {zcEnabled && (
                <th className="px-3 py-2 font-medium">主持</th>
              )}
              {isMonthCycle && (
                <th className="px-3 py-2 font-medium">冠名</th>
              )}
              <th className="px-3 py-2 font-medium">总福利</th>
            </tr>
          </thead>
          <tbody>
            {top10.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={5 + (qmEnabled ? 1 : 0) + (zcEnabled ? 1 : 0) + (isMonthCycle ? 1 : 0)}
                  className="px-3 py-8 text-center text-textMuted"
                >
                  暂无数据
                </td>
              </tr>
            ) : top10.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({
                    length: 5 + (qmEnabled ? 1 : 0) + (zcEnabled ? 1 : 0) + (isMonthCycle ? 1 : 0),
                  }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              top10.map((item) => {
                const isTop3 = item.rank <= 3
                const rowBg = isTop3 ? rankRowBg[item.rank - 1] : ''
                const badgeColor = isTop3
                  ? rankBadgeColors[item.rank - 1]
                  : '#94A3B8'
                const hasNaming =
                  isMonthCycle &&
                  item.namings &&
                  item.namings.some((n) => n.count > 0)
                return (
                  <tr
                    key={`${item.branchId}-${item.personnelId}`}
                    className={`border-b border-border last:border-0 ${rowBg} hover:bg-surface dark:hover:bg-surface/50 transition-colors duration-200`}
                  >
                    <td className="px-3 py-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold font-mono shadow-sm"
                        style={{ backgroundColor: badgeColor }}
                      >
                        {item.rank}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-textPrimary font-medium">
                      {item.personnelName}
                    </td>
                    <td className="px-3 py-2 text-textPrimary font-mono">{item.sg}</td>
                    <td className="px-3 py-2 text-textPrimary font-mono">{item.mx}</td>
                    {qmEnabled && (
                      <td className="px-3 py-2 text-textPrimary font-mono">{item.qm}</td>
                    )}
                    {zcEnabled && (
                      <td className="px-3 py-2 text-textPrimary font-mono">{item.zcDays}</td>
                    )}
                    {isMonthCycle && (
                      <td className="px-3 py-2 text-textPrimary text-xs whitespace-nowrap">
                        {formatNamings(item.namings)}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="text-textPrimary font-semibold font-mono">
                        {item.totalWelfare}
                      </div>
                      {hasNaming && (item.namingWelfare ?? 0) > 0 && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                          含冠名 {item.namingWelfare}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 福利计算说明卡片
 */
function WelfareRuleCard({
  branchId,
  isMonthCycle,
}: {
  branchId: number
  isMonthCycle: boolean
}) {
  const [rules, setRules] = useState<RewardRule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rewardRulesApi
      .get(branchId)
      .then(setRules)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [branchId])

  const currentRule = rules[0]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${branchId}-${isMonthCycle}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="bg-card border border-border rounded-xl p-5"
      >
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Info size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              福利计算说明
            </h3>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              isMonthCycle
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            }`}
          >
            {isMonthCycle ? '按月统计周期' : '按周统计周期'}
          </span>
        </div>
        {!currentRule && loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg p-4 bg-card">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : currentRule ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <RuleCard
              label="收光转换"
              value={`× ${currentRule.sgRatio}`}
              desc={`收光 × ${currentRule.sgRatio} 计入福利`}
              enabled={currentRule.sgEnabled}
            />
            <RuleCard
              label="全麦转换"
              value={`× ${currentRule.qmRatio}`}
              desc={`全麦 × ${currentRule.qmRatio} 计入福利`}
              enabled={currentRule.qmEnabled}
            />
            <RuleCard
              label="排名第1奖励"
              value={currentRule.rank1Reward}
              desc="排名第1额外奖励"
              enabled={currentRule.rankEnabled}
            />
            <RuleCard
              label="排名第2奖励"
              value={currentRule.rank2Reward}
              desc="排名第2额外奖励"
              enabled={currentRule.rankEnabled}
            />
            <RuleCard
              label="排名第3奖励"
              value={currentRule.rank3Reward}
              desc="排名第3额外奖励"
              enabled={currentRule.rankEnabled}
            />
            <RuleCard
              label="麦序达标阈值"
              value={currentRule.maixuThreshold}
              desc="麦序达到此值视为达标"
              enabled={currentRule.maixuEnabled}
            />
            <RuleCard
              label="麦序达标奖励"
              value={currentRule.maixuReward}
              desc="麦序达标后额外奖励"
              enabled={currentRule.maixuEnabled}
            />
            <RuleCard
              label="麦序最低标准"
              value={currentRule.maixuMinStandard}
              desc="启用后麦序未达标不计任何福利"
              enabled={currentRule.maixuMinEnabled}
            />
            <RuleCard
              label="所属厅"
              value={currentRule.branch?.name ?? '-'}
              desc="当前规则适用的厅"
            />
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-textMuted">
            暂无规则数据
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function RuleCard({
  label,
  value,
  desc,
  enabled = true,
}: {
  label: string
  value: number | string
  desc: string
  enabled?: boolean
}) {
  return (
    <div
      className={`border rounded-lg p-4 bg-card card-hover ${
        enabled
          ? 'border-border hover:border-primary/50'
          : 'border-border opacity-60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-textSecondary">{label}</div>
        {!enabled && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            已关闭
          </span>
        )}
      </div>
      <div
        className={`text-lg font-semibold mt-1 font-mono ${
          enabled ? 'text-textPrimary' : 'text-textMuted line-through'
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-textMuted mt-1">{desc}</div>
    </div>
  )
}

/**
 * 排名卡片骨架屏
 */
function RankingCardSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="p-0">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="border-b border-border last:border-0 px-3 py-2">
                <div className="flex gap-2">
                  {Array.from({ length: 6 }).map((_, k) => (
                    <Skeleton key={k} className="h-5 flex-1" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
