import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  Layers,
  Sparkles,
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
  getWeekRangeText,
  getMonthRangeText,
  matchNamePinyin,
} from "../utils";
import { Skeleton } from "../components/Skeleton";
import GroupedSelect from "../components/GroupedSelect";
import ThemeToggle from "../components/ThemeToggle";
import DotField from "../components/DotField";
import TiltCard from "../components/TiltCard";
import GlobalSpotlight from "../components/GlobalSpotlight";
import type { RankingItem, Branch, BranchGroup, StatCycle } from "../types";
import "./PublicRanking.css";

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

  const primaryRgb = hexToRgbStr(primaryValue);
  const dotGradientFrom = `rgba(${primaryRgb}, ${resolvedTheme === 'dark' ? 0.5 : 0.42})`;
  const dotGradientTo = `rgba(${primaryRgb}, ${resolvedTheme === 'dark' ? 0.35 : 0.25})`;
  const dotGlowColor = primaryValue;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([]);
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    Promise.all([
      publicApi.listBranches(),
      publicApi.listBranchGroups(),
    ])
      .then(([list, groups]) => {
        setBranches(list.filter((b) => !b.closed));
        setBranchGroups(groups);
      })
      .catch((err) => toast.error(getPublicErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isGroupMode = selectedValue.startsWith("g");
  const selectedGroupId = isGroupMode ? Number(selectedValue.slice(1)) : undefined;
  const branchId = !isGroupMode && selectedValue ? Number(selectedValue) : undefined;

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branches, branchId],
  );
  const selectedGroup = useMemo(
    () => branchGroups.find((g) => g.id === selectedGroupId),
    [branchGroups, selectedGroupId],
  );

  const standaloneBranches = useMemo(
    () => branches.filter((b) => !b.groupId),
    [branches],
  );
  const activeGroups = useMemo(
    () => branchGroups
      .map((g) => ({ ...g, branches: g.branches.filter((b) => !b.closed) }))
      .filter((g) => g.branches.length > 0),
    [branchGroups],
  );

  const allCards = useMemo(() => {
    const branchCards = standaloneBranches.map((b) => ({
      type: "branch" as const,
      key: `b${b.id}`,
      branch: b,
    }));
    const groupCards = activeGroups.map((g) => ({
      type: "group" as const,
      key: `g${g.id}`,
      group: g,
    }));
    return [...branchCards, ...groupCards];
  }, [standaloneBranches, activeGroups]);

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  return (
    <div className="relative min-h-screen bg-surface">
      <GlobalSpotlight />

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
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--default-bg-color) 35%, transparent) 0%, color-mix(in srgb, var(--default-bg-color) 55%, transparent) 100%)',
        }}
      />

      {/* 顶部标题栏 */}
      <header className="sticky top-0 z-30 border-b border-border/60"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--default-box-color) 50%, transparent)',
          backdropFilter: 'blur(20px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
            className="w-10 h-10 rounded-custom-sm bg-gradient-to-br from-warning/30 to-primary/20 flex items-center justify-center ring-1 ring-warning/30 shadow-lg shadow-warning/10"
          >
            <Trophy size={20} className="text-warning" />
          </motion.div>
          <div className="flex-1 min-w-0">
            <motion.h1
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="text-lg font-bold text-textPrimary truncate tracking-tight"
            >
              麦序排名
            </motion.h1>
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
        {/* 搜索框 + 厅选择器 */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 flex-wrap"
        >
          <div className="pr-search relative group flex-1 min-w-[200px]">
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

          <GroupedSelect
            value={selectedValue}
            onChange={(val) => setSelectedValue(val)}
            topOption={{ value: "", label: "全部厅" }}
            groups={[
              ...(activeGroups.length > 0
                ? [{
                    label: "合厅组",
                    options: activeGroups.map((g) => ({
                      value: `g${g.id}`,
                      label: `${g.name}（${g.branches.length}个厅）`,
                    })),
                  }]
                : []),
              {
                label: "厅",
                options: standaloneBranches.map((b) => ({
                  value: String(b.id),
                  label: `${b.name}${b.statCycle === "MONTH" ? "（按月）" : ""}`,
                })),
              },
            ]}
            minWidth={180}
            maxWidth={280}
          />
        </motion.div>

        {/* 搜索结果或排名卡片 */}
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <SearchResults query={trimmedQuery} toast={toast} />
            </motion.div>
          ) : !selectedValue ? (
            <motion.div
              key="all"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {allCards.length === 0 ? (
                <RankingCardSkeleton />
              ) : allCards.length === 1 ? (
                allCards[0].type === "branch" ? (
                  <PodiumCard title={allCards[0].branch.name} branch={allCards[0].branch} toast={toast} />
                ) : (
                  <PodiumCard title={allCards[0].group.name} group={allCards[0].group} toast={toast} />
                )
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {allCards.map((card, idx) => (
                    <motion.div
                      key={card.key}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <TiltCard maxTilt={3}>
                        {card.type === "branch" ? (
                          <PodiumCard title={card.branch.name} branch={card.branch} toast={toast} />
                        ) : (
                          <PodiumCard title={card.group.name} group={card.group} toast={toast} />
                        )}
                      </TiltCard>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : isGroupMode && selectedGroup ? (
            <motion.div
              key={`group-${selectedGroupId}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <TiltCard maxTilt={2}>
                <PodiumCard title={selectedGroup.name} group={selectedGroup} toast={toast} />
              </TiltCard>
            </motion.div>
          ) : selectedBranch ? (
            <motion.div
              key={`branch-${branchId}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <TiltCard maxTilt={2}>
                <PodiumCard title={selectedBranch.name} branch={selectedBranch} toast={toast} />
              </TiltCard>
            </motion.div>
          ) : (
            <RankingCardSkeleton />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/**
 * 领奖台卡片：统一渲染厅和合厅组
 * branch 和 group 二选一传入
 */
function PodiumCard({
  title,
  branch,
  group,
  toast,
}: {
  title: string;
  branch?: Branch;
  group?: BranchGroup;
  toast: ReturnType<typeof useToast>;
}) {
  // 确定周期和成员厅列表
  const memberBranches = useMemo(() => {
    if (group) return group.branches.filter((b) => !b.closed);
    return [];
  }, [group]);

  const statCycle: StatCycle = group
    ? (memberBranches[0]?.statCycle ?? "WEEK")
    : (branch?.statCycle ?? "WEEK");
  const isMonthCycle = statCycle === "MONTH";
  const isGroup = !!group;

  // 查询用的 ID
  const queryBranchId = branch?.id;
  const queryGroupId = group?.id;

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
  } = usePeriodNavigator({
    branch: { statCycle },
    availableWeeks: weeks,
  });

  useEffect(() => {
    publicApi
      .listWeeks(queryBranchId, queryGroupId)
      .then(setWeeks)
      .catch(() => {});
  }, [queryBranchId, queryGroupId]);

  useEffect(() => {
    setLoading(true);
    publicApi
      .getRanking(formatDate(weekStart), queryBranchId, undefined, queryGroupId)
      .then(setRanking)
      .catch((err) => toast.error(getPublicErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, queryBranchId, queryGroupId]);

  const top3 = useMemo(() => ranking.slice(0, 3), [ranking]);
  const rest = useMemo(() => ranking.slice(3, 10), [ranking]);

  // 查找人员所属厅名（合厅组模式）
  const getBranchName = (bid: number) =>
    memberBranches.find((b) => b.id === bid)?.name;

  return (
    <div className="art-card pr-card">
      {/* 卡片头部 */}
      <div className="relative flex items-center gap-3 px-5 py-4 border-b border-border/60 flex-wrap bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className={`w-9 h-9 rounded-custom-sm flex items-center justify-center ring-1 ${isGroup ? 'bg-primary/10 ring-primary/15' : 'bg-warning/10 ring-warning/15'}`}>
          {isGroup ? <Layers size={18} className="text-primary" /> : <Trophy size={18} className="text-warning" />}
        </div>
        <h3 className="text-lg font-bold text-textPrimary tracking-tight">{title}</h3>
        {isGroup && (
          <span className="pr-tag px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 bg-primary/10 text-primary ring-1 ring-primary/20">
            <Layers size={11} />
            {memberBranches.length}个厅
          </span>
        )}
        <span className={`pr-tag px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
          isMonthCycle ? "bg-warning/10 text-warning ring-1 ring-warning/20" : "bg-success/10 text-success ring-1 ring-success/20"
        }`}>
          <Calendar size={11} />
          {isMonthCycle ? "按月统计" : "按周统计"}
        </span>
      </div>

      {/* 日期选择器 */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 flex-wrap bg-g-100/30 dark:bg-g-100/5">
        <div className="flex items-center rounded-custom-sm border border-border overflow-hidden">
          <button onClick={handlePrev} className="p-2 bg-card text-textSecondary hover:text-primary hover:bg-primary/5 tad-200 cursor-pointer border-r border-border" aria-label={isMonthCycle ? "上一月" : "上一周"}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={handleNext} className="p-2 bg-card text-textSecondary hover:text-primary hover:bg-primary/5 tad-200 cursor-pointer" aria-label={isMonthCycle ? "下一月" : "下一周"}>
            <ChevronRight size={14} />
          </button>
        </div>
        {isMonthCycle ? (
          <GroupedSelect
            value={selectedMonthRef}
            onChange={(val) => setWeekStart(new Date(val))}
            options={availableMonths.map((m) => ({ value: m.ref, label: getMonthRangeText(m.ref) }))}
            minWidth={200}
          />
        ) : (
          <GroupedSelect
            value={formatDate(weekStart)}
            onChange={(val) => setWeekStart(new Date(val))}
            options={availableWeeks.map((w) => ({ value: w, label: getWeekRangeText(w) }))}
            minWidth={200}
          />
        )}
        <button onClick={handleThisPeriod} className="px-3 py-1.5 rounded-custom-sm bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium tad-200 cursor-pointer border border-primary/20">
          {isMonthCycle ? "本月" : "本周"}
        </button>
      </div>

      {/* 领奖台 + 列表 */}
      {loading && top3.length === 0 ? (
        <PodiumSkeleton />
      ) : ranking.length === 0 ? (
        <div className="pr-empty px-5 py-16 text-center text-textMuted">
          <div className="flex flex-col items-center gap-2">
            <Sparkles size={32} className="text-g-300 dark:text-g-600" />
            <span className="text-sm">暂无数据</span>
          </div>
        </div>
      ) : (
        <>
          {/* 领奖台 Top3 */}
          <div className="podium">
            <AnimatePresence mode="popLayout">
              {top3.map((item, idx) => {
                const rank = item.rank;
                const podiumClass = rank === 1 ? "podium-1" : rank === 2 ? "podium-2" : "podium-3";
                const badgeClass = `podium-badge podium-badge-${rank}`;
                const branchName = isGroup ? getBranchName(item.branchId) : undefined;
                return (
                  <motion.div
                    key={`${item.branchId}-${item.personnelId}`}
                    className={`podium-item ${podiumClass}`}
                    initial={{ opacity: 0, y: 30, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/* 人物信息区 */}
                    <div className="podium-info">
                      <div className={badgeClass}>
                        {rank === 1 ? <Crown size={rank === 1 ? 24 : 18} className="text-white" /> : <Medal size={18} className="text-white" />}
                      </div>
                      <span className="podium-name text-textPrimary">{item.personnelName}</span>
                      <span className="podium-mx">{item.mx}</span>
                      {branchName && <span className="podium-branch">{branchName}</span>}
                    </div>
                    {/* 底座 */}
                    <div className="podium-base">
                      {rank}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* 4-10 名列表 */}
          {rest.length > 0 && (
            <div className="border-t border-border/60">
              <div className="px-5 py-2 bg-g-100/30 dark:bg-g-100/5 text-xs text-textMuted font-medium uppercase tracking-wider">
                第 4 - {Math.min(ranking.length, 10)} 名
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {rest.map((item, idx) => {
                        const branchName = isGroup ? getBranchName(item.branchId) : undefined;
                        return (
                          <motion.tr
                            key={`${item.branchId}-${item.personnelId}`}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.3, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                            className="pr-row border-b border-border/40 last:border-0"
                          >
                            <td className="px-4 py-2.5 w-16">
                              <div className="list-badge">{item.rank}</div>
                            </td>
                            <td className="px-2 py-2.5 text-textPrimary font-medium">
                              {item.personnelName}
                            </td>
                            {isGroup && (
                              <td className="px-2 py-2.5 text-textSecondary text-xs">
                                <span className="px-2 py-0.5 rounded-full bg-g-100/70 dark:bg-g-100/10">{branchName ?? "-"}</span>
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-right">
                              <span className="list-mx">{item.mx}</span>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 领奖台骨架屏 */
function PodiumSkeleton() {
  return (
    <div className="podium">
      {[2, 1, 3].map((rank) => (
        <div key={rank} className={`podium-item podium-${rank}`}>
          <div className="podium-info">
            <Skeleton className={`rounded-full ${rank === 1 ? 'w-[52px] h-[52px]' : 'w-[42px] h-[42px]'}`} />
            <Skeleton className="h-3 w-16 mt-1" />
            <Skeleton className="h-5 w-10 mt-1" />
          </div>
          <Skeleton className={`w-full ${rank === 1 ? 'h-16' : rank === 2 ? 'h-12' : 'h-10'}`} />
        </div>
      ))}
    </div>
  );
}

/** 搜索结果项 */
interface SearchResultItem {
  personnelId: number;
  personnelName: string;
  branchId: number;
  branchName: string;
  rank: number;
  mx: number;
  hasData: boolean;
}

/** 搜索结果 */
function SearchResults({ query, toast }: { query: string; toast: ReturnType<typeof useToast> }) {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      publicApi.listPersonnel(),
      publicApi.getRanking(formatDate(new Date()), undefined),
    ])
      .then(([allPersonnel, ranking]) => {
        const q = debouncedQuery.trim();
        const matched = allPersonnel.filter((p) => matchNamePinyin(p.personnelName, q));
        const rankMap = new Map<string, RankingItem>();
        for (const r of ranking) rankMap.set(`${r.personnelId}-${r.branchId}`, r);
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
    <div className="art-card pr-card">
      <div className="relative flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/8 via-primary/3 to-transparent">
        <div className="w-9 h-9 rounded-custom-sm bg-primary/10 flex items-center justify-center ring-1 ring-primary/15">
          <Search size={18} className="text-primary" />
        </div>
        <h3 className="text-lg font-bold text-textPrimary tracking-tight">搜索结果</h3>
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
                    <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : results.length === 0 ? (
              <tr className="pr-empty">
                <td colSpan={4} className="px-4 py-12 text-center text-textMuted">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={28} className="text-g-300 dark:text-g-600" />
                    <span className="text-sm">未找到匹配的人员</span>
                  </div>
                </td>
              </tr>
            ) : (
              <AnimatePresence mode="popLayout">
                {results.map((item, idx) => (
                  <motion.tr
                    key={`${item.branchId}-${item.personnelId}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.6), ease: [0.16, 1, 0.3, 1] }}
                    className="pr-row border-b border-border/40 last:border-0"
                  >
                    <td className="px-4 py-3">
                      {item.hasData ? (
                        <div className="list-badge">{item.rank}</div>
                      ) : (
                        <div className="w-7 h-7 flex items-center justify-center text-textMuted text-sm">-</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-textPrimary font-medium">{item.personnelName}</td>
                    <td className="px-4 py-3 text-textSecondary text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-g-100/70 dark:bg-g-100/10">{item.branchName}</span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold text-base text-right tabular-nums ${item.hasData ? 'list-mx' : 'text-textMuted'}`}>
                      {item.mx}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
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
        <div key={i} className="art-card pr-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent">
            <Skeleton className="w-9 h-9 rounded-custom-sm" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 bg-g-100/30 dark:bg-g-100/5">
            <Skeleton className="h-8 w-16 rounded-custom-sm" />
            <Skeleton className="h-8 w-44 rounded-custom-sm" />
            <Skeleton className="h-7 w-12 rounded-custom-sm" />
          </div>
          <PodiumSkeleton />
        </div>
      ))}
    </>
  );
}
