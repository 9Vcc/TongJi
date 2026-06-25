import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Info } from 'lucide-react'
import {
  rankingApi,
  rewardRulesApi,
  dataQueryApi,
  branchesApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  formatDate,
  getWeekStart,
  getWeekRangeText,
  getMonthRangeText,
} from '../utils'
import { Skeleton } from '../components/Skeleton'
import type { RankingItem, RewardRule, Branch, StatCycle } from '../types'

const rankBadgeColors = ['#F59E0B', '#94A3B8', '#CD7F32']
const rankRowBg = [
  'bg-yellow-50 dark:bg-yellow-900/20',
  'bg-slate-50 dark:bg-slate-700/30',
  'bg-orange-50 dark:bg-orange-900/20',
]

export default function Ranking() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'

  const [weekStart, setWeekStart] = useState(formatDate(getWeekStart()))
  const [weeks, setWeeks] = useState<string[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [rules, setRules] = useState<RewardRule[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // 标记会长是否已完成初始随机选厅，避免用户手动切回"全部厅"时被覆盖
  const initBranchRef = useRef(false)

  // 当前厅的统计周期（全部厅时统一按周）
  const currentCycle: StatCycle = useMemo(() => {
    const branch = branches.find((b) => b.id === branchId)
    return branch?.statCycle ?? 'WEEK'
  }, [branches, branchId])
  const isMonthCycle = currentCycle === 'MONTH'

  useEffect(() => {
    // 所有用户都需加载厅列表以获取统计周期
    branchesApi.list().then((list) => {
      setBranches(list)
      // 会长首次进入：随机选择一个厅（而非默认全部厅）
      if (isHuizhang && !initBranchRef.current && list.length > 0) {
        const randomBranch = list[Math.floor(Math.random() * list.length)]
        setBranchId(randomBranch.id)
      }
      initBranchRef.current = true
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    dataQueryApi
      .getWeeks(branchId)
      .then(setWeeks)
      .catch(() => {})
  }, [branchId])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      rankingApi.getRanking(weekStart, branchId),
      rewardRulesApi.get(branchId),
    ])
      .then(([r, rs]) => {
        setRanking(r)
        setRules(rs)
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchId])

  // 合并本周与已选周到下拉列表
  const allWeeks = useMemo(() => {
    const set = new Set(weeks)
    set.add(formatDate(getWeekStart()))
    set.add(weekStart)
    return Array.from(set).sort().reverse()
  }, [weeks, weekStart])

  // 按月统计时：从周列表提取不重复月份，每月取最早周一作为参考日
  const allMonths = useMemo(() => {
    const monthMap = new Map<string, string>() // YYYY-MM -> refDate
    const addMonth = (dateStr: string) => {
      const d = new Date(dateStr)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap.has(key)) monthMap.set(key, dateStr)
    }
    weeks.forEach(addMonth)
    addMonth(formatDate(getWeekStart()))
    addMonth(weekStart)
    return Array.from(monthMap.entries())
      .map(([key, ref]) => ({ key, ref }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [weeks, weekStart])

  // 当前选中月份的参考日（确保 weekStart 落在所选月）
  const selectedMonthRef = useMemo(() => {
    const d = new Date(weekStart)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const found = allMonths.find((m) => m.key === key)
    return found?.ref ?? weekStart
  }, [weekStart, allMonths])

  const currentRule = rules[0]

  return (
    <div className="space-y-5">
      {/* 顶部选择器 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-textSecondary">
            {isMonthCycle ? '月份' : '周次'}
          </label>
          {isMonthCycle ? (
            <select
              value={selectedMonthRef}
              onChange={(e) => setWeekStart(e.target.value)}
              aria-label="选择月份"
              className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 min-w-[220px] cursor-pointer"
            >
              {allMonths.map((m) => (
                <option key={m.key} value={m.ref}>
                  {getMonthRangeText(m.ref)}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              aria-label="选择周次"
              className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 min-w-[220px] cursor-pointer"
            >
              {allWeeks.map((w) => (
                <option key={w} value={w}>
                  {getWeekRangeText(w)}
                </option>
              ))}
            </select>
          )}
          {branchId && (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                isMonthCycle
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              }`}
              title={isMonthCycle ? '该厅按月统计' : '该厅按周统计'}
            >
              {isMonthCycle ? '按月统计' : '按周统计'}
            </span>
          )}
        </div>

        {isHuizhang && (
          <select
            value={branchId ?? ''}
            onChange={(e) =>
              setBranchId(e.target.value ? Number(e.target.value) : undefined)
            }
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
          >
            <option value="">全部厅</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.statCycle === 'MONTH' ? '（按月）' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 数据区域：weekStart/branchId 变化时重新触发入场动画 */}
      <AnimatePresence mode="wait">
      <motion.div
        key={`${weekStart}-${branchId ?? 'all'}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-5"
      >
      {/* 排名表格 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Trophy size={18} className="text-warning" />
          <h3 className="text-base font-semibold text-textPrimary">
            {isMonthCycle ? '本月排名' : '本周排名'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                <th className="px-4 py-3 font-medium">排名</th>
                <th className="px-4 py-3 font-medium">人员</th>
                <th className="px-4 py-3 font-medium">收光</th>
                <th className="px-4 py-3 font-medium">麦序</th>
                <th className="px-4 py-3 font-medium">全麦</th>
                <th className="px-4 py-3 font-medium">基础福利</th>
                <th className="px-4 py-3 font-medium">排名奖励</th>
                <th className="px-4 py-3 font-medium">总福利</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-textMuted"
                  >
                    暂无排名数据
                  </td>
                </tr>
              ) : ranking.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                ranking.map((item) => {
                  const isTop3 = item.rank <= 3
                  const rowBg = isTop3 ? rankRowBg[item.rank - 1] : ''
                  const badgeColor = isTop3
                    ? rankBadgeColors[item.rank - 1]
                    : '#94A3B8'
                  return (
                    <tr
                      key={`${item.personnelId}-${item.branchId}`}
                      className={`border-b border-border last:border-0 ${rowBg} hover:bg-surface dark:hover:bg-surface/50 transition-colors duration-200`}
                    >
                      <td className="px-4 py-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold font-mono shadow-sm"
                          style={{ backgroundColor: badgeColor }}
                        >
                          {item.rank}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-textPrimary font-medium">
                          {item.personnelName}
                        </div>
                        {isHuizhang && (
                          <div className="text-xs text-textMuted">
                            {item.branchName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">{item.sg}</td>
                      <td className="px-4 py-3 text-textPrimary font-mono">{item.mx}</td>
                      <td className="px-4 py-3 text-textPrimary font-mono">{item.qm}</td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {item.baseWelfare}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {item.rankReward}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-semibold font-mono">
                        {item.totalWelfare}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 福利计算说明：仅在选择具体厅时显示（全部厅时不显示） */}
      {branchId && (
      <div className="bg-card border border-border rounded-xl p-5">
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
      </div>
      )}
      </motion.div>
      </AnimatePresence>
    </div>
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
