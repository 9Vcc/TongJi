import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Trophy,
  Eye,
  LogIn,
  LayoutDashboard,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Crown,
  Medal,
  Calendar,
} from "lucide-react";
import { publicApi, getPublicErrorMessage } from "../api/public";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useAppearance } from "../hooks/useAppearance";
import { useDebounce } from "../hooks/useDebounce";
import { usePeriodNavigator } from "../hooks/usePeriodNavigator";
import {
  formatDate,
  getWeekStart,
  getMonthStart,
  getWeekRangeText,
  getMonthRangeText,
  matchNamePinyin,
  rankBadgeColors,
  rankRowBg,
} from "../utils";
import { Skeleton } from "../components/Skeleton";
import GroupedSelect from "../components/GroupedSelect";
import ThemeToggle from "../components/ThemeToggle";
import DotField from "../components/DotField";
import SpotlightCard from "../components/SpotlightCard";
import ChromaSpotlight from "../components/ChromaSpotlight";
import GlobalSpotlight from "../components/GlobalSpotlight";
import type { RankingItem, Branch } from "../types";

/**
 * 公开排名页面：无需登录即可查看
 * 仅展示排名与麦序，不显示收光/全麦/总福利等敏感数据
 * 作为网站默认首页（/），所有人可访问
 */

/** hex(#5d87ff) → "93, 135, 255" */
function hexToRgbStr(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '93, 135, 255'
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
}

export default function PublicRanking() {
  const toast = useToast();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const { primaryValue } = useAppearance();
  const isLoggedIn = !!user;

  // DotField 配色跟随主题色
  const primaryRgb = hexToRgbStr(primaryValue);
  const dotGradientFrom = `rgba(${primaryRgb}, ${resolvedTheme === 'dark' ? 0.5 : 0.42})`;
  const dotGradientTo = `rgba(${primaryRgb}, ${resolvedTheme === 'dark' ? 0.35 : 0.25})`;
  const dotGlowColor = primaryValue;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    publicApi
      .listBranches()
      .then((list) => setBranches(list.filter((b) => !b.closed)))
      .catch((err) => toast.error(getPublicErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branches, branchId],
  );

  // 搜索：跨所有厅查询本周/本月数据
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  return (
    <div className="relative min-h-screen bg-surface">
      {/* 全局聚光灯：跟随鼠标照亮附近卡片 */}
      <GlobalSpotlight />

      {/* DotField 点阵背景：用 fixed 定位铺满整个视口，避免内容超一屏后出现黑边 */}
      {/* 明亮模式提升点阵透明度确保可见，暗黑模式用更亮的点阵 */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <DotField
          dotRadius={1.8}
          dotSpacing={15}
          bulgeStrength={55}
          glowRadius={150}
          sparkle={false}
          gradientFrom={dotGradientFrom}
          gradientTo={dotGradientTo}
          glowColor={dotGlowColor}
        />
      </div>
      {/* 半透明遮罩：统一内容与背景对比度，确保字体可见性 */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            resolvedTheme === 'dark'
              ? 'linear-gradient(180deg, color-mix(in srgb, var(--default-bg-color) 35%, transparent) 0%, color-mix(in srgb, var(--default-bg-color) 55%, transparent) 100%)'
              : 'linear-gradient(180deg, color-mix(in srgb, var(--default-bg-color) 35%, transparent) 0%, color-mix(in srgb, var(--default-bg-color) 55%, transparent) 100%)',
        }}
      />

      {/* 顶部标题栏（磨砂玻璃） */}
      <header className="relative z-10 sticky top-0 border-b border-border/60"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--default-box-color) 50%, transparent)',
          backdropFilter: 'blur(20px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-custom-sm bg-gradient-to-br from-warning/25 to-primary/15 flex items-center justify-center ring-1 ring-warning/25">
            <Trophy size={20} className="text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-textPrimary truncate tracking-tight">
              麦序排名
            </h1>
            <p className="text-xs text-textMuted flex items-center gap-1 mt-0.5">
              <Eye size={11} />
              所有人可查看
            </p>
          </div>
          <ThemeToggle />
          <Link
            to={isLoggedIn ? "/dashboard" : "/login"}
            className="text-xs font-medium text-textSecondary hover:text-primary tad-200 px-3.5 py-2 rounded-custom-sm border border-border hover:border-primary/50 hover:bg-primary/5 flex items-center gap-1.5"
          >
            {isLoggedIn ? <LayoutDashboard size={14} /> : <LogIn size={14} />}
            {isLoggedIn ? "进入后台" : "登录后台"}
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* 搜索框 + 厅选择器（同一行） */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 搜索框 */}
          <div className="relative group flex-1 min-w-[200px]">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none group-focus-within:text-primary tad-200"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入接档名查看麦序"
              aria-label="搜索人员"
              className="w-full pl-11 pr-10 py-3 border border-border/60 rounded-custom text-sm text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 hover:border-primary/40 tad-200 shadow-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--default-box-color) 50%, transparent)',
                backdropFilter: 'blur(16px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
              }}
            />
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="清除搜索"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-textMuted hover:text-textPrimary hover:bg-g-100 dark:hover:bg-g-100/20 rounded-full tad-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* 厅选择器 */}
          <GroupedSelect
            value={branchId !== undefined ? String(branchId) : ""}
            onChange={(val) =>
              setBranchId(val ? Number(val) : undefined)
            }
            topOption={{ value: "", label: "全部厅" }}
            options={branches.map((b) => ({
              value: String(b.id),
              label: `${b.name}${b.statCycle === "MONTH" ? "（按月）" : ""}`,
            }))}
            minWidth={160}
          />
        </div>

        {/* 搜索结果或排名卡片 */}
        {isSearching ? (
          <SearchResults query={trimmedQuery} toast={toast} />
        ) : !branchId ? (
          // 全部厅模式：每个厅一个独立卡片
          branches.length === 0 ? (
            <RankingCardSkeleton />
          ) : branches.length === 1 ? (
            // 只有一个厅时：卡片占满宽度
            <PublicBranchCard branch={branches[0]} toast={toast} />
          ) : (
            // 多个厅时：双列网格 + 聚光灯灰度效果
            <ChromaSpotlight radius={320} damping={0.5}>
              <div className="grid gap-5 lg:grid-cols-2">
                {branches.map((b) => (
                  <PublicBranchCard key={b.id} branch={b} toast={toast} />
                ))}
              </div>
            </ChromaSpotlight>
          )
        ) : (
          // 单厅模式：单卡片占满宽度
          <PublicBranchCard branch={selectedBranch!} toast={toast} />
        )}
      </main>
    </div>
  );
}

/**
 * 公开厅排名卡片：含独立日期选择器和仅显示排名/人员/麦序的表格
 */
function PublicBranchCard({
  branch,
  toast,
}: {
  branch: Branch;
  toast: ReturnType<typeof useToast>;
}) {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(false);

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
  } = usePeriodNavigator({ branch, availableWeeks: weeks });

  useEffect(() => {
    publicApi
      .listWeeks(branch.id)
      .then(setWeeks)
      .catch(() => {});
  }, [branch.id]);

  useEffect(() => {
    setLoading(true);
    // 本周/本月模式 + 选本周/本月：不传 weekStart，后端用 new Date() 确保正确
    const isThisPeriod = isMonthCycle
      ? formatDate(weekStart) === formatDate(getMonthStart(new Date()))
      : formatDate(weekStart) === formatDate(getWeekStart());
    const ws = isThisPeriod ? undefined : formatDate(weekStart);
    publicApi
      .getRanking(ws, branch.id)
      .then(setRanking)
      .catch((err) => toast.error(getPublicErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, branch.id]);

  const top10 = useMemo(() => ranking.slice(0, 10), [ranking]);

  return (
    <SpotlightCard className="glass-card">
      {/* 卡片头部：厅名 + 周期标签 + 渐变背景 */}
      <div className="relative flex items-center gap-3 px-5 py-4 border-b border-border/60 flex-wrap bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="w-9 h-9 rounded-custom-sm bg-warning/10 flex items-center justify-center ring-1 ring-warning/15">
          <Trophy size={18} className="text-warning" />
        </div>
        <h3 className="text-lg font-bold text-textPrimary tracking-tight">
          {branch.name}
        </h3>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
            isMonthCycle
              ? "bg-warning/10 text-warning ring-1 ring-warning/20"
              : "bg-success/10 text-success ring-1 ring-success/20"
          }`}
        >
          <Calendar size={11} />
          {isMonthCycle ? "按月统计" : "按周统计"}
        </span>
      </div>
      {/* 日期选择器：按钮组风格 */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 flex-wrap bg-g-100/30 dark:bg-g-100/5">
        <div className="flex items-center rounded-custom-sm border border-border overflow-hidden">
          <button
            onClick={handlePrev}
            className="p-2 bg-card text-textSecondary hover:text-primary hover:bg-primary/5 tad-200 cursor-pointer border-r border-border"
            aria-label={isMonthCycle ? "上一月" : "上一周"}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={handleNext}
            className="p-2 bg-card text-textSecondary hover:text-primary hover:bg-primary/5 tad-200 cursor-pointer"
            aria-label={isMonthCycle ? "下一月" : "下一周"}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {isMonthCycle ? (
          <GroupedSelect
            value={selectedMonthRef}
            onChange={(val) => setWeekStart(new Date(val))}
            options={availableMonths.map((m) => ({
              value: m.ref,
              label: getMonthRangeText(m.ref),
            }))}
            minWidth={200}
          />
        ) : (
          <GroupedSelect
            value={formatDate(weekStart)}
            onChange={(val) => setWeekStart(new Date(val))}
            options={availableWeeks.map((w) => ({
              value: w,
              label: getWeekRangeText(w),
            }))}
            minWidth={200}
          />
        )}
        <button
          onClick={handleThisPeriod}
          className="px-3 py-1.5 rounded-custom-sm bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium tad-200 cursor-pointer border border-primary/20"
        >
          {isMonthCycle ? "本月" : "本周"}
        </button>
      </div>
      {/* 排名表格：只显示排名、人员、麦序 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-g-100/50 dark:bg-g-100/5 border-b border-border/60">
            <tr className="text-left text-textMuted">
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">排名</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">人员</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">麦序</th>
            </tr>
          </thead>
          <tbody>
            {top10.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-12 text-center text-textMuted"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Trophy size={28} className="text-g-300 dark:text-g-600" />
                    <span className="text-sm">暂无数据</span>
                  </div>
                </td>
              </tr>
            ) : top10.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              top10.map((item) => {
                const isTop3 = item.rank <= 3;
                // 保留原有工具类作为底色，叠加渐变与左侧竖条指示器
                const rowBg = isTop3 ? rankRowBg[item.rank - 1] : "";
                const badgeColor = isTop3
                  ? rankBadgeColors[item.rank - 1]
                  : "#94A3B8";
                // Top3 渐变背景 + 左侧竖条指示器配色
                const rowGradient =
                  item.rank === 1
                    ? "bg-gradient-to-r from-amber-50/80 to-transparent dark:from-amber-900/10"
                    : item.rank === 2
                      ? "bg-gradient-to-r from-slate-50/80 to-transparent dark:from-slate-700/10"
                      : item.rank === 3
                        ? "bg-gradient-to-r from-orange-50/80 to-transparent dark:from-orange-900/10"
                        : "";
                // 排名徽章渐变与阴影配色
                const badgeClass =
                  item.rank === 1
                    ? "bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md shadow-amber-500/30"
                    : item.rank === 2
                      ? "bg-gradient-to-br from-slate-300 to-slate-400 shadow-md shadow-slate-400/30"
                      : item.rank === 3
                        ? "bg-gradient-to-br from-orange-300 to-orange-400 shadow-md shadow-orange-400/30"
                        : "bg-g-200 text-textSecondary";
                return (
                  <tr
                    key={`${item.branchId}-${item.personnelId}`}
                    className={`border-b border-border/40 last:border-0 ${rowBg} ${rowGradient} ${isTop3 ? "border-l-4" : ""} hover:bg-primary/5 dark:hover:bg-primary/10 tad-200`}
                    style={
                      isTop3
                        ? { borderLeftColor: badgeColor }
                        : undefined
                    }
                  >
                    <td className="px-4 py-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs font-mono ${badgeClass} ${item.rank <= 3 ? "text-white" : ""}`}
                      >
                        {item.rank === 1 ? (
                          <Crown size={13} className="text-white" />
                        ) : item.rank <= 3 ? (
                          <Medal size={13} className="text-white" />
                        ) : (
                          item.rank
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-textPrimary font-medium">
                      <span className={item.rank === 1 ? "font-semibold" : ""}>
                        {item.personnelName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-textPrimary font-mono font-bold text-base text-right tabular-nums">
                      {item.mx}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SpotlightCard>
  );
}

/**
 * 搜索结果项：合并人员列表和排名数据
 * hasData=false 表示该人员本周/本月未录入数据
 */
interface SearchResultItem {
  personnelId: number;
  personnelName: string;
  branchId: number;
  branchName: string;
  rank: number; // 0 表示无排名（未录入数据）
  mx: number;
  hasData: boolean;
}

/**
 * 搜索结果：跨所有厅查询本周/本月数据，按姓名匹配
 * 同时显示未录入数据的人员（麦序为0，排名显示"-"）
 */
function SearchResults({
  query,
  toast,
}: {
  query: string;
  toast: ReturnType<typeof useToast>;
}) {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    setLoading(true);
    // 同时查询所有人员列表和本周/本月排名数据
    // 人员列表用于显示未录入数据的人员，排名数据用于填充有数据的人员
    Promise.all([
      publicApi.listPersonnel(),
      publicApi.getRanking(undefined, undefined),
    ])
      .then(([allPersonnel, ranking]) => {
        const q = debouncedQuery.trim();
        // 按姓名匹配人员（含未录入数据的人员，支持中文首字母）
        const matched = allPersonnel.filter((p) =>
          matchNamePinyin(p.personnelName, q),
        );
        // 合并排名数据：构建 (personnelId, branchId) -> RankingItem 映射
        const rankMap = new Map<string, RankingItem>();
        for (const r of ranking) {
          rankMap.set(`${r.personnelId}-${r.branchId}`, r);
        }
        // 生成搜索结果：有数据显示排名和麦序，无数据显示麦序0
        const merged: SearchResultItem[] = matched.map((p) => {
          const rankItem = rankMap.get(`${p.personnelId}-${p.branchId}`);
          return {
            personnelId: p.personnelId,
            personnelName: p.personnelName,
            branchId: p.branchId,
            branchName: p.branchName,
            rank: rankItem?.rank ?? 0,
            mx: rankItem?.mx ?? 0,
            hasData: !!rankItem,
          };
        });
        // 排序：有数据的优先（按排名升序），无数据的排后（按姓名）
        merged.sort((a, b) => {
          if (a.hasData && !b.hasData) return -1;
          if (!a.hasData && b.hasData) return 1;
          if (a.hasData && b.hasData) return a.rank - b.rank;
          return a.personnelName.localeCompare(b.personnelName);
        });
        setResults(merged.slice(0, 50));
      })
      .catch((err) => toast.error(getPublicErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  return (
    <SpotlightCard className="glass-card">
      {/* 卡片头部：渐变背景 + 标题 + 匹配数 */}
      <div className="relative flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/8 via-primary/3 to-transparent">
        <div className="w-9 h-9 rounded-custom-sm bg-primary/10 flex items-center justify-center ring-1 ring-primary/15">
          <Search size={18} className="text-primary" />
        </div>
        <h3 className="text-lg font-bold text-textPrimary tracking-tight">
          搜索结果
        </h3>
        <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-medium bg-g-200/60 dark:bg-g-100/10 text-textSecondary">
          共 {results.length} 条匹配
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-g-100/50 dark:bg-g-100/5 border-b border-border/60">
            <tr className="text-left text-textMuted">
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">排名</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">人员</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider">所属厅</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wider text-right">麦序</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : results.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-textMuted"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Search size={28} className="text-g-300 dark:text-g-600" />
                    <span className="text-sm">未找到匹配的人员</span>
                  </div>
                </td>
              </tr>
            ) : (
              results.map((item) => {
                const isTop3 = item.hasData && item.rank <= 3;
                // 保留原有工具类作为底色，叠加渐变与左侧竖条指示器
                const rowBg = isTop3 ? rankRowBg[item.rank - 1] : "";
                const badgeColor = isTop3
                  ? rankBadgeColors[item.rank - 1]
                  : "#94A3B8";
                // Top3 渐变背景 + 左侧竖条指示器配色
                const rowGradient =
                  item.hasData && item.rank === 1
                    ? "bg-gradient-to-r from-amber-50/80 to-transparent dark:from-amber-900/10"
                    : item.hasData && item.rank === 2
                      ? "bg-gradient-to-r from-slate-50/80 to-transparent dark:from-slate-700/10"
                      : item.hasData && item.rank === 3
                        ? "bg-gradient-to-r from-orange-50/80 to-transparent dark:from-orange-900/10"
                        : "";
                // 排名徽章渐变与阴影配色
                const badgeClass =
                  item.hasData && item.rank === 1
                    ? "bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md shadow-amber-500/30"
                    : item.hasData && item.rank === 2
                      ? "bg-gradient-to-br from-slate-300 to-slate-400 shadow-md shadow-slate-400/30"
                      : item.hasData && item.rank === 3
                        ? "bg-gradient-to-br from-orange-300 to-orange-400 shadow-md shadow-orange-400/30"
                        : "bg-g-200 text-textSecondary";
                return (
                  <tr
                    key={`${item.branchId}-${item.personnelId}`}
                    className={`border-b border-border/40 last:border-0 ${rowBg} ${rowGradient} ${isTop3 ? "border-l-4" : ""} hover:bg-primary/5 dark:hover:bg-primary/10 tad-200`}
                    style={
                      isTop3
                        ? { borderLeftColor: badgeColor }
                        : undefined
                    }
                  >
                    <td className="px-4 py-3">
                      {item.hasData ? (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs font-mono ${badgeClass} ${item.rank <= 3 ? "text-white" : ""}`}
                        >
                          {item.rank === 1 ? (
                            <Crown size={13} className="text-white" />
                          ) : item.rank <= 3 ? (
                            <Medal size={13} className="text-white" />
                          ) : (
                            item.rank
                          )}
                        </div>
                      ) : (
                        <div className="w-8 h-8 flex items-center justify-center text-textMuted text-sm">
                          -
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-textPrimary font-medium">
                      {item.personnelName}
                    </td>
                    <td className="px-4 py-3 text-textSecondary text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-g-100/70 dark:bg-g-100/10">
                        {item.branchName}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 font-mono font-bold text-base text-right tabular-nums ${
                        item.hasData
                          ? "text-textPrimary"
                          : "text-textMuted"
                      }`}
                    >
                      {item.mx}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SpotlightCard>
  );
}

function RankingCardSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="art-card overflow-hidden"
        >
          {/* 卡片头部骨架 */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent">
            <Skeleton className="w-9 h-9 rounded-custom-sm" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          {/* 日期选择器骨架 */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 bg-g-100/30 dark:bg-g-100/5">
            <Skeleton className="h-8 w-16 rounded-custom-sm" />
            <Skeleton className="h-8 w-44 rounded-custom-sm" />
            <Skeleton className="h-7 w-12 rounded-custom-sm" />
          </div>
          {/* 表格行骨架 */}
          <div className="p-0">
            {Array.from({ length: 5 }).map((_, j) => (
              <div
                key={j}
                className="border-b border-border/40 last:border-0 px-4 py-3 flex items-center gap-3"
              >
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 flex gap-3">
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
