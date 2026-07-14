import { useEffect, useMemo, useState } from "react";
import {
  Trophy,
  Eye,
  LogIn,
  LayoutDashboard,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { publicApi, getPublicErrorMessage } from "../api/public";
import { useToast } from "../hooks/useToast";
import { useAuth } from "../hooks/useAuth";
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
import type { RankingItem, Branch } from "../types";

/**
 * 公开排名页面：无需登录即可查看
 * 仅展示排名与麦序，不显示收光/全麦/总福利等敏感数据
 * 作为网站默认首页（/），所有人可访问
 */
export default function PublicRanking() {
  const toast = useToast();
  const { user } = useAuth();
  const isLoggedIn = !!user;

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
    <div className="min-h-screen bg-surface">
      {/* 顶部标题栏 */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Trophy size={20} className="text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-textPrimary truncate">
              麦序排名
            </h1>
            <p className="text-xs text-textMuted flex items-center gap-1">
              <Eye size={11} />
              所有人可查看
            </p>
          </div>
          <ThemeToggle />
          <a
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="text-xs text-textSecondary hover:text-primary transition-colors px-3 py-1.5 rounded-md border border-border hover:border-primary/50 flex items-center gap-1.5"
          >
            {isLoggedIn ? <LayoutDashboard size={14} /> : <LogIn size={14} />}
            {isLoggedIn ? "进入后台" : "登录后台"}
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {/* 搜索框 */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="输入接档名查看麦序"
            aria-label="搜索人员"
            className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors duration-200"
          />
          {isSearching && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="清除搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary rounded transition-colors duration-200 cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 厅选择器 */}
        <div className="flex items-center justify-end">
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
            // 多个厅时：双列网格
            <div className="grid gap-5 lg:grid-cols-2">
              {branches.map((b) => (
                <PublicBranchCard key={b.id} branch={b} toast={toast} />
              ))}
            </div>
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border flex-wrap">
        <Trophy size={18} className="text-warning" />
        <h3 className="text-base font-semibold text-textPrimary">{branch.name}</h3>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            isMonthCycle
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          }`}
        >
          {isMonthCycle ? "按月统计" : "按周统计"}
        </span>
      </div>
      {/* 日期选择器 */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
        <button
          onClick={handlePrev}
          className="p-1.5 border border-border rounded-md bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          aria-label={isMonthCycle ? "上一月" : "上一周"}
        >
          <ChevronLeft size={14} />
        </button>
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
          onClick={handleNext}
          className="p-1.5 border border-border rounded-md bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          aria-label={isMonthCycle ? "下一月" : "下一周"}
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={handleThisPeriod}
          className="px-2.5 py-1.5 border border-border rounded-md bg-card text-xs text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
        >
          {isMonthCycle ? "本月" : "本周"}
        </button>
      </div>
      {/* 排名表格：只显示排名、人员、麦序 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr className="text-left text-textSecondary">
              <th className="px-3 py-2 font-medium">排名</th>
              <th className="px-3 py-2 font-medium">人员</th>
              <th className="px-3 py-2 font-medium">麦序</th>
            </tr>
          </thead>
          <tbody>
            {top10.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-8 text-center text-textMuted"
                >
                  暂无数据
                </td>
              </tr>
            ) : top10.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              top10.map((item) => {
                const isTop3 = item.rank <= 3;
                const rowBg = isTop3 ? rankRowBg[item.rank - 1] : "";
                const badgeColor = isTop3
                  ? rankBadgeColors[item.rank - 1]
                  : "#94A3B8";
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
                    <td className="px-3 py-2 text-textPrimary font-mono font-semibold">
                      {item.mx}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Search size={18} className="text-primary" />
        <h3 className="text-base font-semibold text-textPrimary">搜索结果</h3>
        <span className="text-xs text-textMuted ml-auto">
          共 {results.length} 条匹配
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr className="text-left text-textSecondary">
              <th className="px-3 py-2 font-medium">排名</th>
              <th className="px-3 py-2 font-medium">人员</th>
              <th className="px-3 py-2 font-medium">所属厅</th>
              <th className="px-3 py-2 font-medium">麦序</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : results.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-textMuted"
                >
                  未找到匹配的人员
                </td>
              </tr>
            ) : (
              results.map((item) => {
                const isTop3 = item.hasData && item.rank <= 3;
                const rowBg = isTop3 ? rankRowBg[item.rank - 1] : "";
                const badgeColor = isTop3
                  ? rankBadgeColors[item.rank - 1]
                  : "#94A3B8";
                return (
                  <tr
                    key={`${item.branchId}-${item.personnelId}`}
                    className={`border-b border-border last:border-0 ${rowBg} hover:bg-surface dark:hover:bg-surface/50 transition-colors duration-200`}
                  >
                    <td className="px-3 py-2">
                      {item.hasData ? (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold font-mono shadow-sm"
                          style={{ backgroundColor: badgeColor }}
                        >
                          {item.rank}
                        </div>
                      ) : (
                        <div className="w-7 h-7 flex items-center justify-center text-textMuted text-sm">
                          -
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-textPrimary font-medium">
                      {item.personnelName}
                    </td>
                    <td className="px-3 py-2 text-textSecondary text-xs">
                      {item.branchName}
                    </td>
                    <td
                      className={`px-3 py-2 font-mono font-semibold ${
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
    </div>
  );
}

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
              <div
                key={j}
                className="border-b border-border last:border-0 px-3 py-2"
              >
                <div className="flex gap-2">
                  {Array.from({ length: 3 }).map((_, k) => (
                    <Skeleton key={k} className="h-5 flex-1" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
