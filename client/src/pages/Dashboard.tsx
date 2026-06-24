import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import {
  Users,
  Sun,
  ListOrdered,
  Gift,
  ChevronLeft,
  ChevronRight,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import {
  dashboardApi,
  rankingApi,
  branchesApi,
  dataQueryApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useTheme } from '../hooks/useTheme'
import {
  formatDate,
  getWeekStart,
  getPreviousWeekStart,
  getWeekRangeText,
} from '../utils'
import type {
  DashboardSummary,
  DashboardCompare,
  RankingItem,
  Branch,
} from '../types'
import AnimatedNumber from '../components/AnimatedNumber'
import CandlestickChart from '../components/CandlestickChart'
import {
  KpiCardSkeleton,
  ChartSkeleton,
  Top3Skeleton,
} from '../components/Skeleton'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface KpiCardProps {
  title: string
  value: number
  icon: typeof Users
  color: string
  trend?: number | null
  loading: boolean
}

function KpiCard({ title, value, icon: Icon, color, trend, loading }: KpiCardProps) {
  const trendIcon =
    trend == null ? null : trend > 0 ? (
      <TrendingUp size={14} className="text-up" />
    ) : trend < 0 ? (
      <TrendingDown size={14} className="text-down" />
    ) : (
      <Minus size={14} className="text-textMuted" />
    )
  const trendColor =
    trend == null
      ? ''
      : trend > 0
        ? 'text-up'
        : trend < 0
          ? 'text-down'
          : 'text-textMuted'

  return (
    <div className="bg-card border border-border rounded-xl p-5 card-hover hover:border-primary/50">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-textSecondary">{title}</div>
          {loading ? (
            <div className="skeleton-shimmer h-8 w-24 rounded mt-2" />
          ) : (
            <div className="text-2xl font-semibold text-textPrimary mt-1">
              <AnimatedNumber value={value} />
            </div>
          )}
          {trend != null && !loading && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}>
              {trendIcon}
              <span className="font-mono">
                {trend > 0 ? '+' : ''}
                {trend.toFixed(1)}%
              </span>
              <span className="text-textMuted">较上周</span>
            </div>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `rgb(${color} / 0.1)` }}
        >
          <Icon size={20} style={{ color: `rgb(${color})` }} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { resolvedTheme } = useTheme()
  const toast = useToast()
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [compare, setCompare] = useState<DashboardCompare | null>(null)
  const [top3, setTop3] = useState<RankingItem[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const isHuizhang = user?.role === 'HUIZHANG'
  const isDark = resolvedTheme === 'dark'

  // 主题相关颜色
  const chartTextColor = isDark ? '#CBD5E1' : '#4B5563'
  const chartGridColor = isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(107, 114, 128, 0.15)'

  useEffect(() => {
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
  }, [isHuizhang])

  // 获取可用周列表
  useEffect(() => {
    dataQueryApi.getWeeks(branchId).then(setAvailableWeeks).catch(() => {})
  }, [branchId])

  useEffect(() => {
    const weekParam = formatDate(weekStart)
    setLoading(true)
    Promise.all([
      dashboardApi.getSummary(weekParam, branchId),
      dashboardApi.getCompare(weekParam, branchId),
      dashboardApi.getTop3(weekParam, branchId),
      rankingApi.getRanking(weekParam, branchId),
    ])
      .then(([s, c, t, r]) => {
        setSummary(s)
        setCompare(c)
        setTop3(t)
        setRanking(r)
      })
      .catch((err) => {
        toast.error(getErrorMessage(err))
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchId])

  const handlePrevWeek = () => setWeekStart(getPreviousWeekStart(weekStart))
  const handleNextWeek = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    if (next <= getWeekStart()) {
      setWeekStart(next)
    }
  }

  // 计算变化趋势
  const trends = useMemo(() => {
    if (!compare) return { sg: null, mx: null, welfare: null, personnel: null }
    const calc = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100
    return {
      sg: calc(compare.thisWeek.totalSG, compare.lastWeek.totalSG),
      mx: calc(compare.thisWeek.totalMX, compare.lastWeek.totalMX),
      welfare: calc(
        compare.thisWeek.totalWelfare,
        compare.lastWeek.totalWelfare
      ),
      personnel: calc(
        compare.thisWeek.personnelCount,
        compare.lastWeek.personnelCount
      ),
    }
  }, [compare])

  // 按人员汇总柱状图数据
  const personnelChart = useMemo(() => {
    const labels = ranking.map((r) => r.personnelName)
    return {
      labels,
      datasets: [
        {
          label: '收光',
          data: ranking.map((r) => r.sg),
          backgroundColor: 'rgb(5 150 105 / 0.8)',
          borderRadius: 4,
        },
        {
          label: '麦序',
          data: ranking.map((r) => r.mx),
          backgroundColor: 'rgb(217 119 6 / 0.8)',
          borderRadius: 4,
        },
        {
          label: '全麦',
          data: ranking.map((r) => r.qm),
          backgroundColor: 'rgb(34 197 94 / 0.8)',
          borderRadius: 4,
        },
      ],
    }
  }, [ranking])

  // 周对比柱状图数据
  const compareChart = useMemo(() => {
    if (!compare) {
      return {
        labels: ['收光', '麦序', '全麦', '总福利'],
        datasets: [],
      }
    }
    return {
      labels: ['收光', '麦序', '全麦', '总福利'],
      datasets: [
        {
          label: '本周',
          data: [
            compare.thisWeek.totalSG,
            compare.thisWeek.totalMX,
            compare.thisWeek.totalQM,
            compare.thisWeek.totalWelfare,
          ],
          backgroundColor: 'rgb(5 150 105 / 0.8)',
          borderRadius: 4,
        },
        {
          label: '上周',
          data: [
            compare.lastWeek.totalSG,
            compare.lastWeek.totalMX,
            compare.lastWeek.totalQM,
            compare.lastWeek.totalWelfare,
          ],
          backgroundColor: isDark
            ? 'rgb(100 116 139 / 0.8)'
            : 'rgb(156 163 175 / 0.8)',
          borderRadius: 4,
        },
      ],
    }
  }, [compare, isDark])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 12, family: 'Fira Sans' },
          color: chartTextColor,
          usePointStyle: true,
          pointStyle: 'circle' as const,
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
        titleColor: isDark ? '#F1F5F9' : '#111827',
        bodyColor: isDark ? '#CBD5E1' : '#4B5563',
        borderColor: isDark ? '#334155' : '#E5E7EB',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: 'Fira Sans' },
        bodyFont: { family: 'Fira Code' },
      },
    },
    scales: {
      x: {
        grid: { color: chartGridColor },
        ticks: { color: chartTextColor, font: { family: 'Fira Sans' } },
      },
      y: {
        beginAtZero: true,
        grid: { color: chartGridColor },
        ticks: { color: chartTextColor, font: { family: 'Fira Code' } },
      },
    },
  }

  // Top3 按分部分组
  const top3ByBranch = useMemo(() => {
    const map = new Map<string, RankingItem[]>()
    for (const item of top3) {
      const key = item.branchName
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [top3])

  const rankColors = ['217 119 6', '156 163 175', '205 127 50']

  return (
    <div className="space-y-5">
      {/* 周选择器 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            aria-label="上一周"
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={formatDate(weekStart)}
            onChange={(e) => setWeekStart(new Date(e.target.value))}
            aria-label="选择周次"
            className="px-4 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary min-w-[220px] focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer"
          >
            {!availableWeeks.includes(formatDate(weekStart)) && (
              <option value={formatDate(weekStart)}>
                {getWeekRangeText(weekStart)}
              </option>
            )}
            {availableWeeks
              .slice()
              .sort()
              .reverse()
              .map((w) => (
                <option key={w} value={w}>
                  {getWeekRangeText(w)}
                </option>
              ))}
          </select>
          <button
            onClick={handleNextWeek}
            aria-label="下一周"
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart())}
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            本周
          </button>
        </div>

        {isHuizhang && (
          <select
            value={branchId ?? ''}
            onChange={(e) =>
              setBranchId(e.target.value ? Number(e.target.value) : undefined)
            }
            aria-label="选择分部"
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer"
          >
            <option value="">全部分部</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 数据区域：weekStart/branchId 变化时重新触发入场动画 */}
      <AnimatePresence mode="wait">
      <motion.div
        key={`${formatDate(weekStart)}-${branchId ?? 'all'}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-5"
      >
      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!summary ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <div>
              <KpiCard
                title="分部人员数"
                value={summary?.personnelCount ?? 0}
                icon={Users}
                color="5 150 105"
                trend={trends.personnel}
                loading={false}
              />
            </div>
            <div>
              <KpiCard
                title="本周总收光"
                value={summary?.totalSG ?? 0}
                icon={Sun}
                color="217 119 6"
                trend={trends.sg}
                loading={false}
              />
            </div>
            <div>
              <KpiCard
                title="本周总麦序"
                value={summary?.totalMX ?? 0}
                icon={ListOrdered}
                color="34 197 94"
                trend={trends.mx}
                loading={false}
              />
            </div>
            <div>
              <KpiCard
                title="本周总福利"
                value={summary?.totalWelfare ?? 0}
                icon={Gift}
                color="239 68 68"
                trend={trends.welfare}
                loading={false}
              />
            </div>
          </>
        )}
      </div>

      {/* K线图 */}
      <CandlestickChart branchId={branchId} />

      {/* 图表行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ranking.length === 0 && compare === null ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-base font-semibold text-textPrimary mb-4">
                本周数据汇总（按人员）
              </h3>
              <div className="h-72">
                {ranking.length > 0 ? (
                  <Bar data={personnelChart} options={chartOptions} />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-textMuted">
                    暂无数据
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-base font-semibold text-textPrimary mb-4">
                周对比（本周 vs 上周）
              </h3>
              <div className="h-72">
                {compare ? (
                  <Bar data={compareChart} options={chartOptions} />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-textMuted">
                    暂无数据
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Top3 排名 */}
      {top3.length === 0 ? (
        <Top3Skeleton />
      ) : (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-warning" />
            <h3 className="text-base font-semibold text-textPrimary">
              Top3 排名
            </h3>
          </div>
          {top3ByBranch.length === 0 ? (
            <div className="py-8 text-center text-sm text-textMuted">
              暂无排名数据
            </div>
          ) : (
            <div className="space-y-4">
              {top3ByBranch.map(([branchName, items]) => (
                <div key={branchName}>
                  <div className="text-sm font-medium text-textSecondary mb-2">
                    {branchName}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {items.map((item) => {
                      const color = rankColors[item.rank - 1] || '156 163 175'
                      return (
                        <div
                          key={item.personnelId}
                          className="border border-border rounded-lg p-4 flex items-center gap-3 card-hover hover:border-primary/50"
                        >
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold font-mono shrink-0"
                            style={{ backgroundColor: `rgb(${color})` }}
                          >
                            {item.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-textPrimary truncate">
                              {item.personnelName}
                            </div>
                            <div className="text-xs text-textMuted mt-0.5 font-mono">
                              麦序 {item.mx} · 福利 {item.totalWelfare}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </motion.div>
      </AnimatePresence>
    </div>
  )
}
