import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import {
  Users,
  Sun,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  dashboardApi,
  rankingApi,
  branchesApi,
  branchGroupsApi,
  dataQueryApi,
  rewardRulesApi,
  getErrorMessage,
} from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../hooks/useTheme";
import { usePeriodNavigator } from "../hooks/usePeriodNavigator";
import {
  formatDate,
  getWeekStart,
  getMonthStart,
  getWeekRangeText,
  getMonthRangeText,
} from "../utils";
import type {
  DashboardSummary,
  DashboardCompare,
  RankingItem,
  RewardRule,
  Branch,
  BranchGroup,
  StatCycle,
} from "../types";
import AnimatedNumber from "../components/AnimatedNumber";
import GroupedSelect from "../components/GroupedSelect";
import {
  KpiCardSkeleton,
  Skeleton,
  Top3Skeleton,
} from "../components/Skeleton";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

interface KpiCardProps {
  title: string;
  value: number;
  icon: typeof Users;
  color: string;
  trend?: number | null;
  loading: boolean;
  periodLabel?: string;
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  trend,
  loading,
  periodLabel = "上周",
}: KpiCardProps) {
  const trendIcon =
    trend == null ? null : trend > 0 ? (
      <TrendingUp size={14} className="text-up" />
    ) : trend < 0 ? (
      <TrendingDown size={14} className="text-down" />
    ) : (
      <Minus size={14} className="text-textMuted" />
    );
  const trendColor =
    trend == null
      ? ""
      : trend > 0
        ? "text-up"
        : trend < 0
          ? "text-down"
          : "text-textMuted";

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
            <div
              className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}
            >
              {trendIcon}
              <span className="font-mono">
                {trend > 0 ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
              <span className="text-textMuted">较{periodLabel}</span>
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
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isHuizhang = user?.role === "HUIZHANG";
  const isChaoguan = user?.role === "CHAOGUAN";
  const canSelectBranch = isHuizhang || isChaoguan;
  const { resolvedTheme } = useTheme();
  const toast = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [compare, setCompare] = useState<DashboardCompare | null>(null);
  const [top3, setTop3] = useState<RankingItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  // 非会长默认锁定到自己所在厅；会长默认未选厅
  const [branchId, setBranchId] = useState<number | undefined>(() =>
    isHuizhang ? undefined : (user?.branchId ?? undefined),
  );
  // 合厅组选中 ID（与 branchId 互斥）
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  // 合厅组模式
  const isGroupMode = selectedGroupId !== undefined;
  // 本周数据汇总卡片专用排名数据（跟随页面顶部全局 branchId 切换）
  const [chartRanking, setChartRanking] = useState<RankingItem[]>([]);
  // 当前厅奖励规则（用于判断全麦转换是否关闭）
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [loading, setLoading] = useState(false);

  const isDark = resolvedTheme === "dark";

  // 主题相关颜色
  const chartTextColor = isDark ? "#CBD5E1" : "#4B5563";
  const chartGridColor = isDark
    ? "rgba(148, 163, 184, 0.15)"
    : "rgba(107, 114, 128, 0.15)";

  // 选中的合厅组对象
  const selectedGroup = useMemo(
    () => branchGroups.find((g) => g.id === selectedGroupId),
    [branchGroups, selectedGroupId],
  );

  // 当前统计周期：直接跟随所选厅的 statCycle；合厅组取组成员的 statCycle（同组合一）
  const currentCycle: StatCycle = useMemo(() => {
    if (isGroupMode && selectedGroup) {
      const activeBranches = selectedGroup.branches.filter((b) => !b.closed);
      return activeBranches[0]?.statCycle ?? "WEEK";
    }
    if (!branchId) return "WEEK";
    const branch = branches.find((b) => b.id === branchId);
    return branch?.statCycle ?? "WEEK";
  }, [branches, branchId, isGroupMode, selectedGroup]);
  const isMonthCycle = currentCycle === "MONTH";
  // 周期文案
  const periodWord = isMonthCycle ? "月" : "周";
  const thisPeriodWord = isMonthCycle ? "本月" : "本周";
  const lastPeriodWord = isMonthCycle ? "上月" : "上周";

  // 日期导航：统一使用 usePeriodNavigator hook
  // 初始 weekStart 设为本月1日（对两种周期都能正确查询）
  // 注意：availableWeeks 状态（原始 API 列表）传入 hook 用于计算 availableMonths，
  // 但周次下拉仍直接使用原始 availableWeeks 状态（Dashboard 的 weekDisplayStart 逻辑独特）
  const {
    weekStart,
    setWeekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
    availableMonths,
    selectedMonthRef,
  } = usePeriodNavigator({
    branch:
      isGroupMode && selectedGroup
        ? ({ statCycle: currentCycle } as Pick<Branch, "statCycle">)
        : (branches.find((b) => b.id === branchId) ?? null),
    availableWeeks,
    initialWeekStart: getMonthStart(new Date()),
  });

  // 月统计厅切换时重置 weekStart 为本月1日
  // 本周周一可能跨月（如7月1日是周二，本周周一是6月29日），导致月查询归属到上月
  const prevIsMonthCycleRef = useRef(false);
  useEffect(() => {
    if (isMonthCycle && !prevIsMonthCycleRef.current) {
      const today = new Date();
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      thisMonthStart.setHours(0, 0, 0, 0);
      setWeekStart(thisMonthStart);
    }
    prevIsMonthCycleRef.current = isMonthCycle;
  }, [isMonthCycle]);

  useEffect(() => {
    // 所有用户都需加载厅列表以获取统计周期（过滤已关闭的厅）
    branchesApi
      .list()
      .then((list) => {
        setBranches(list.filter((b) => !b.closed));
      })
      .catch(() => {});
    // 加载合厅组列表（会长查全部，超管查授权的合厅组）
    if (canSelectBranch) {
      branchGroupsApi
        .list()
        .then(setBranchGroups)
        .catch(() => {});
    }
  }, []);

  // 获取可用周列表
  useEffect(() => {
    if (isGroupMode && selectedGroup) {
      const groupBranchIds = selectedGroup.branches
        .filter((b) => !b.closed)
        .map((b) => b.id);
      dataQueryApi
        .getWeeks(undefined, groupBranchIds)
        .then(setAvailableWeeks)
        .catch(() => {});
    } else {
      dataQueryApi
        .getWeeks(branchId)
        .then(setAvailableWeeks)
        .catch(() => {});
    }
  }, [branchId, isGroupMode, selectedGroup]);

  useEffect(() => {
    // 合厅组模式或单厅模式：均需有有效选择才查询
    if (!branchId && !isGroupMode) return;
    const weekParam = formatDate(weekStart);
    setLoading(true);
    const groupId = isGroupMode ? selectedGroupId : undefined;
    Promise.all([
      dashboardApi.getSummary(weekParam, branchId, currentCycle, undefined, groupId),
      dashboardApi.getCompare(weekParam, branchId, currentCycle, undefined, groupId),
      dashboardApi.getTop3(weekParam, branchId, currentCycle, undefined, groupId),
      // 合厅组模式不加载单厅规则（qmEnabled 默认 true 显示全麦）
      isGroupMode ? Promise.resolve([]) : rewardRulesApi.get(branchId!),
    ])
      .then(([s, c, t, rs]) => {
        setSummary(s);
        setCompare(c);
        setTop3(t);
        setRules(rs as RewardRule[]);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchId, currentCycle, isGroupMode, selectedGroupId]);

  // 全麦是否计入福利：合厅组模式默认显示全麦；单厅模式仅当该厅规则关闭全麦转换时为 false
  const qmEnabled = useMemo(() => {
    if (isGroupMode) return true;
    if (!branchId) return true;
    const rule = rules.find((r) => r.branchId === branchId);
    return rule ? rule.qmEnabled : true;
  }, [rules, branchId, isGroupMode]);

  // 加载本期数据汇总卡片专用排名数据（跟随页面顶部全局 branchId 切换）
  useEffect(() => {
    if (!branchId && !isGroupMode) return;
    const weekParam = formatDate(weekStart);
    const groupId = isGroupMode ? selectedGroupId : undefined;
    rankingApi
      .getRanking(weekParam, branchId, currentCycle, undefined, groupId)
      .then(setChartRanking)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branchId, currentCycle, isGroupMode, selectedGroupId]);

  // 周统计厅显示用的 weekStart（周一格式）
  // weekStart 可能是本月1日（初始值或月统计厅切换过来），getWeekStart 转为所在周周一
  // 保证周次选择器 value 与 availableWeeks（周一格式）匹配
  const weekDisplayStart = isMonthCycle ? weekStart : getWeekStart(weekStart);

  // 计算变化趋势
  const trends = useMemo(() => {
    if (!compare) return { sg: null, mx: null, personnel: null };
    const calc = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
    return {
      sg: calc(compare.thisWeek.totalSG, compare.lastWeek.totalSG),
      mx: calc(compare.thisWeek.totalMX, compare.lastWeek.totalMX),
      personnel: calc(
        compare.thisWeek.personnelCount,
        compare.lastWeek.personnelCount,
      ),
    };
  }, [compare]);

  // 本期数据汇总柱状图数据（主看板）
  // X 轴为所选厅名，三个指标（收光/麦序/全麦）各一组三色柱子
  const branchChart = useMemo(() => {
    // 按厅聚合 chartRanking 数据：厅名 → 指标汇总
    const branchMap = new Map<string, { sg: number; mx: number; qm: number }>();
    for (const r of chartRanking) {
      const cur = branchMap.get(r.branchName) ?? { sg: 0, mx: 0, qm: 0 };
      cur.sg += r.sg;
      cur.mx += r.mx;
      cur.qm += r.qm;
      branchMap.set(r.branchName, cur);
    }
    const labels = [...branchMap.keys()];
    const data = [...branchMap.values()];
    // 三个指标各一组柱子，固定三色便于分辨；全麦转换关闭时不显示全麦
    const datasets = [
      {
        label: "收光",
        data: data.map((d) => d.sg),
        backgroundColor: "rgb(5 150 105 / 0.8)",
        borderColor: "rgb(5 150 105)",
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: "麦序",
        data: data.map((d) => d.mx),
        backgroundColor: "rgb(217 119 6 / 0.8)",
        borderColor: "rgb(217 119 6)",
        borderWidth: 1,
        borderRadius: 4,
      },
    ];
    if (qmEnabled) {
      datasets.push({
        label: "全麦",
        data: data.map((d) => d.qm),
        backgroundColor: "rgb(34 197 94 / 0.8)",
        borderColor: "rgb(34 197 94)",
        borderWidth: 1,
        borderRadius: 4,
      });
    }
    return {
      labels,
      datasets,
    };
  }, [chartRanking, qmEnabled]);

  // 周对比柱状图数据（收光/麦序/全麦；全麦转换关闭时不显示全麦）
  const compareChart = useMemo(() => {
    const labels = qmEnabled ? ["收光", "麦序", "全麦"] : ["收光", "麦序"];
    if (!compare) {
      return {
        labels,
        datasets: [],
      };
    }
    const thisWeekData = qmEnabled
      ? [
          compare.thisWeek.totalSG,
          compare.thisWeek.totalMX,
          compare.thisWeek.totalQM,
        ]
      : [compare.thisWeek.totalSG, compare.thisWeek.totalMX];
    const lastWeekData = qmEnabled
      ? [
          compare.lastWeek.totalSG,
          compare.lastWeek.totalMX,
          compare.lastWeek.totalQM,
        ]
      : [compare.lastWeek.totalSG, compare.lastWeek.totalMX];
    return {
      labels,
      datasets: [
        {
          label: thisPeriodWord,
          data: thisWeekData,
          backgroundColor: "rgb(5 150 105 / 0.8)",
          borderColor: "rgb(5 150 105)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: lastPeriodWord,
          data: lastWeekData,
          backgroundColor: isDark
            ? "rgb(100 116 139 / 0.8)"
            : "rgb(156 163 175 / 0.8)",
          borderColor: isDark ? "rgb(100 116 139)" : "rgb(156 163 175)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [compare, isDark, thisPeriodWord, lastPeriodWord, qmEnabled]);

  // 本周数据汇总卡片专用配置：竖直方向（X 轴厅名，Y 轴数值）
  const branchChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          font: { size: 12, family: "Fira Sans" },
          color: chartTextColor,
          usePointStyle: true,
          pointStyle: "circle" as const,
        },
      },
      tooltip: {
        backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
        titleColor: isDark ? "#F1F5F9" : "#111827",
        bodyColor: isDark ? "#CBD5E1" : "#4B5563",
        borderColor: isDark ? "#334155" : "#E5E7EB",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: "Fira Sans" },
        bodyFont: { family: "Fira Code" },
      },
    },
    scales: {
      // X 轴：类别轴（厅名）
      x: {
        grid: { color: chartGridColor },
        ticks: { color: chartTextColor, font: { family: "Fira Sans" } },
      },
      // Y 轴：数值轴（纵向延伸）
      y: {
        beginAtZero: true,
        grid: { color: chartGridColor },
        ticks: { color: chartTextColor, font: { family: "Fira Code" } },
      },
    },
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          font: { size: 12, family: "Fira Sans" },
          color: chartTextColor,
          usePointStyle: true,
          pointStyle: "circle" as const,
        },
      },
      tooltip: {
        backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
        titleColor: isDark ? "#F1F5F9" : "#111827",
        bodyColor: isDark ? "#CBD5E1" : "#4B5563",
        borderColor: isDark ? "#334155" : "#E5E7EB",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: "Fira Sans" },
        bodyFont: { family: "Fira Code" },
      },
    },
    scales: {
      x: {
        grid: { color: chartGridColor },
        ticks: { color: chartTextColor, font: { family: "Fira Sans" } },
      },
      y: {
        beginAtZero: true,
        grid: { color: chartGridColor },
        ticks: { color: chartTextColor, font: { family: "Fira Code" } },
      },
    },
  };

  // Top3 按厅分组
  const top3ByBranch = useMemo(() => {
    const map = new Map<string, RankingItem[]>();
    for (const item of top3) {
      const key = item.branchName;
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [top3]);

  const rankColors = ["217 119 6", "156 163 175", "205 127 50"];

  return (
    <div className="space-y-5">
      {/* 周期选择器（按周/按月厅自动切换） */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            aria-label={isMonthCycle ? "上一月" : "上一周"}
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronLeft size={16} />
          </button>
          {isMonthCycle ? (
            <GroupedSelect
              value={selectedMonthRef}
              onChange={(val) => setWeekStart(new Date(val))}
              options={availableMonths.map((m) => ({
                value: m.ref,
                label: getMonthRangeText(m.ref),
              }))}
              minWidth={220}
            />
          ) : (
            <GroupedSelect
              value={formatDate(weekDisplayStart)}
              onChange={(val) => setWeekStart(new Date(val))}
              options={[
                ...(!availableWeeks.includes(formatDate(weekDisplayStart))
                  ? [{ value: formatDate(weekDisplayStart), label: getWeekRangeText(weekDisplayStart) }]
                  : []),
                ...availableWeeks.slice().sort().reverse().map((w) => ({
                  value: w,
                  label: getWeekRangeText(w),
                })),
              ]}
              minWidth={220}
            />
          )}
          <button
            onClick={handleNext}
            aria-label={isMonthCycle ? "下一月" : "下一周"}
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={handleThisPeriod}
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {isMonthCycle ? "本月" : "本周"}
          </button>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              isMonthCycle
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            }`}
            title={isMonthCycle ? "该厅按月统计" : "该厅按周统计"}
          >
            {isMonthCycle ? "按月统计" : "按周统计"}
          </span>
        </div>

        <GroupedSelect
          value={
            isGroupMode
              ? `g${selectedGroupId}`
              : (branchId !== undefined ? String(branchId) : "")
          }
          onChange={(val) => {
            if (val.startsWith("g")) {
              // 选择合厅组：清空厅选择
              setSelectedGroupId(Number(val.slice(1)));
              setBranchId(undefined);
            } else {
              // 选择普通厅：清空合厅组选择
              setSelectedGroupId(undefined);
              setBranchId(val ? Number(val) : undefined);
            }
          }}
          placeholder="选择厅"
          topOption={
            canSelectBranch
              ? { value: "", label: isHuizhang ? "未选厅" : "全部授权厅" }
              : undefined
          }
          groups={[
            ...(branchGroups.length > 0
              ? [{
                  label: "合厅组",
                  options: branchGroups.map((g) => ({
                    value: `g${g.id}`,
                    label: `${g.name}（${g.branches.filter((b) => !b.closed).length}个厅）`,
                  })),
                }]
              : []),
            {
              label: "厅",
              options: branches.map((b) => ({
                value: String(b.id),
                label: `${b.name}${b.statCycle === "MONTH" ? "（按月）" : ""}`,
              })),
            },
          ]}
          minWidth={180}
          maxWidth={280}
        />
      </div>

      {/* 数据区域：weekStart/branchId 变化时重新触发入场动画 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${formatDate(weekStart)}-${branchId ?? "all"}-${selectedGroupId ?? ""}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5"
        >
          {!branchId && !isGroupMode ? (
            <div className="bg-card border border-border rounded-xl px-5 py-16 text-center text-sm text-textMuted">
              请先选择厅
            </div>
          ) : (
          <>
          {/* KPI 卡片 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {!summary ? (
              <>
                <KpiCardSkeleton />
                <KpiCardSkeleton />
                <KpiCardSkeleton />
              </>
            ) : (
              <>
                <div>
                  <KpiCard
                    title="排档人数"
                    value={summary?.personnelCount ?? 0}
                    icon={Users}
                    color="5 150 105"
                    trend={trends.personnel}
                    loading={false}
                    periodLabel={lastPeriodWord}
                  />
                </div>
                <div>
                  <KpiCard
                    title={`${thisPeriodWord}总收光`}
                    value={summary?.totalSG ?? 0}
                    icon={Sun}
                    color="217 119 6"
                    trend={trends.sg}
                    loading={false}
                    periodLabel={lastPeriodWord}
                  />
                </div>
                <div>
                  <KpiCard
                    title={`${thisPeriodWord}总麦序`}
                    value={summary?.totalMX ?? 0}
                    icon={ListOrdered}
                    color="34 197 94"
                    trend={trends.mx}
                    loading={false}
                    periodLabel={lastPeriodWord}
                  />
                </div>
              </>
            )}
          </div>

          {/* 主看板：本期数据汇总（各厅指标对比）柱状图 */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-base font-semibold text-textPrimary mb-4">
              {thisPeriodWord}数据汇总（各厅对比）
            </h3>
            <div className="h-80">
              {chartRanking.length === 0 ? (
                loading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-textMuted">
                    暂无数据
                  </div>
                )
              ) : (
                <Bar data={branchChart} options={branchChartOptions} />
              )}
            </div>
          </div>

          {/* 周期对比柱状图（本期 vs 上期）：仅当本期与上期均有数据时显示 */}
          {compare &&
            compare.thisWeek.personnelCount > 0 &&
            compare.lastWeek.personnelCount > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-base font-semibold text-textPrimary mb-4">
                  {periodWord}对比（{thisPeriodWord} vs {lastPeriodWord}）
                </h3>
                <div className="h-72">
                  <Bar data={compareChart} options={chartOptions} />
                </div>
              </div>
            )}

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
                          const color =
                            rankColors[item.rank - 1] || "156 163 175";
                          // 安全访问冠名明细（按月厅才有，按周厅可能未返回）
                          const namingText = (item.namings ?? [])
                            .filter((n) => n.count > 0)
                            .map((n) => `${n.levelName}×${n.count}`)
                            .join(" ");
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
                                {namingText && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                                    冠名 {namingText}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
