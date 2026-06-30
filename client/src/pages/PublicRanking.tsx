import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Info, Eye } from 'lucide-react'
import { publicApi, getPublicErrorMessage } from '../api/public'
import { useToast } from '../hooks/useToast'
import {
  formatDate,
  getWeekStart,
  getWeekRangeText,
  getMonthRangeText,
} from '../utils'
import { Skeleton } from '../components/Skeleton'
import type { RankingItem, RewardRule, Branch, StatCycle, NamingItem } from '../types'

const rankBadgeColors = ['#F59E0B', '#94A3B8', '#CD7F32']
const rankRowBg = [
  'bg-yellow-50 dark:bg-yellow-900/20',
  'bg-slate-50 dark:bg-slate-700/30',
  'bg-orange-50 dark:bg-orange-900/20',
]

// 冠名展示格式：如 "周冠×2 月冠×1"，无则返回 '-'
function formatNamings(namings?: NamingItem[]): string {
  if (!namings || namings.length === 0) return '-'
  return (
    namings
      .filter((n) => n.count > 0)
      .map((n) => `${n.levelName}×${n.count}`)
      .join(' ') || '-'
  )
}

/**
 * 公开排名页面：无需登录即可查看
 * - 主应用内访问路径：/public/ranking
 * - 独立端口访问：通过 vite.config.public.ts 启动独立服务（默认 5174）
 */
export default function PublicRanking({ loginUrl = '/' }: { loginUrl?: string }) {
  const toast = useToast()

  const [weekStart, setWeekStart] = useState(formatDate(getWeekStart()))
  const [weeks, setWeeks] = useState<string[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [rules, setRules] = useState<RewardRule[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  // 当前厅的统计周期（全部厅时统一按周）
  const currentCycle: StatCycle = useMemo(() => {
    const branch = branches.find((b) => b.id === branchId)
    return branch?.statCycle ?? 'WEEK'
  }, [branches, branchId])
  const isMonthCycle = currentCycle === 'MONTH'

  useEffect(() => {
    publicApi
      .listBranches()
      .then(setBranches)
      .catch((err) => toast.error(getPublicErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    publicApi
      .listWeeks(branchId)
      .then(setWeeks)
      .catch(() => {})
  }, [branchId])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      publicApi.getRanking(weekStart, branchId),
      publicApi.getRewardRules(branchId),
    ])
      .then(([r, rs]) => {
        setRanking(r)
        setRules(rs)
      })
      .catch((err) => toast.error(getPublicErrorMessage(err)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchId])

  // 合并本周与已选周到下拉列表
  const allWeeks = useMemo(() => {
    const set = new Set<string>()
    weeks.forEach((w) => set.add(formatDate(new Date(w))))
    set.add(formatDate(getWeekStart()))
    set.add(weekStart)
    return Array.from(set).sort().reverse()
  }, [weeks, weekStart])

  // 按月统计时：从周列表提取不重复月份
  const allMonths = useMemo(() => {
    const monthMap = new Map<string, string>()
    const addMonth = (dateStr: string) => {
      const formatted = formatDate(new Date(dateStr))
      const d = new Date(formatted)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap.has(key)) monthMap.set(key, formatted)
    }
    weeks.forEach(addMonth)
    addMonth(formatDate(getWeekStart()))
    addMonth(weekStart)
    return Array.from(monthMap.entries())
      .map(([key, ref]) => ({ key, ref }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [weeks, weekStart])

  // 当前选中月份的参考日
  const selectedMonthRef = useMemo(() => {
    const d = new Date(weekStart)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const found = allMonths.find((m) => m.key === key)
    return found?.ref ?? weekStart
  }, [weekStart, allMonths])

  const currentRule = rules[0]
  const isAllBranches = !branchId

  // 全部厅时：按 branchId 分组，每组仅取前 10 名
  const rankingByBranch = useMemo(() => {
    const map = new Map<number, { branchName: string; items: RankingItem[] }>()
    for (const item of ranking) {
      let group = map.get(item.branchId)
      if (!group) {
        group = { branchName: item.branchName, items: [] }
        map.set(item.branchId, group)
      }
      group.items.push(item)
    }
    return Array.from(map.entries()).map(([bid, g]) => ({
      branchId: bid,
      branchName: g.branchName,
      items: g.items.slice(0, 10),
    }))
  }, [ranking])

  // 单厅模式：仅取前 10 名
  const top10Ranking = useMemo(() => ranking.slice(0, 10), [ranking])

  return (
    <div className="min-h-screen bg-surface">
      {/* 顶部标题栏 */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Trophy size={20} className="text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-textPrimary truncate">
              排名公开看板
            </h1>
            <p className="text-xs text-textMuted flex items-center gap-1">
              <Eye size={11} />
              所有人可查看
            </p>
          </div>
          <a
            href={loginUrl}
            className="text-xs text-textSecondary hover:text-primary transition-colors px-3 py-1.5 rounded-md border border-border hover:border-primary/50"
          >
            登录后台
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
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

          <select
            value={branchId ?? ''}
            onChange={(e) =>
              setBranchId(e.target.value ? Number(e.target.value) : undefined)
            }
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            aria-label="选择厅"
          >
            <option value="">全部厅</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.statCycle === 'MONTH' ? '（按月）' : ''}
              </option>
            ))}
          </select>
        </div>

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
            {isAllBranches ? (
              loading ? (
                <RankingCardSkeleton />
              ) : rankingByBranch.length === 0 ? (
                <div className="bg-card border border-border rounded-xl px-5 py-12 text-center text-sm text-textMuted">
                  暂无排名数据
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {rankingByBranch.map((group) => (
                    <RankingCard
                      key={group.branchId}
                      title={group.branchName}
                      items={group.items}
                      isMonthCycle={isMonthCycle}
                    />
                  ))}
                </div>
              )
            ) : (
              <RankingCard
                title={isMonthCycle ? '本月排名' : '本周排名'}
                items={top10Ranking}
                isMonthCycle={isMonthCycle}
                loading={loading}
              />
            )}

            {/* 福利计算说明：仅在选择具体厅时显示 */}
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
      </main>
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
      className={`border rounded-lg p-4 bg-card ${
        enabled ? 'border-border' : 'border-border opacity-60'
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

function RankingCard({
  title,
  items,
  isMonthCycle,
  loading = false,
}: {
  title: string
  items: RankingItem[]
  isMonthCycle: boolean
  loading?: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Trophy size={18} className="text-warning" />
        <h3 className="text-base font-semibold text-textPrimary">{title}</h3>
        <span className="text-xs text-textMuted ml-auto">
          {isMonthCycle ? '本月排名' : '本周排名'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr className="text-left text-textSecondary">
              <th className="px-3 py-2 font-medium">排名</th>
              <th className="px-3 py-2 font-medium">人员</th>
              <th className="px-3 py-2 font-medium">收光</th>
              <th className="px-3 py-2 font-medium">麦序</th>
              <th className="px-3 py-2 font-medium">全麦</th>
              {isMonthCycle && (
                <th className="px-3 py-2 font-medium">冠名</th>
              )}
              <th className="px-3 py-2 font-medium">总福利</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={isMonthCycle ? 7 : 6}
                  className="px-3 py-8 text-center text-textMuted"
                >
                  暂无数据
                </td>
              </tr>
            ) : items.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: isMonthCycle ? 7 : 6 }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              items.map((item) => {
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
                    <td className="px-3 py-2 text-textPrimary font-mono">{item.qm}</td>
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

function RankingCardSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
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
    </div>
  )
}
