import { useEffect, useMemo, useRef, useState } from "react";
import {
  dataQueryApi,
  personnelApi,
  branchesApi,
  branchGroupsApi,
  rewardRulesApi,
  namingLevelsApi,
  getErrorMessage,
} from "../api";
import { usePeriodNavigator } from "../hooks/usePeriodNavigator";
import { useToast } from "../hooks/useToast";
import { formatDate, getWeekStart, getMonthStart } from "../utils";
import type {
  DataRecord,
  Personnel,
  Branch,
  BranchGroup,
  StatCycle,
  RewardRule,
  NamingLevel,
} from "../types";

interface UseDataEntryDataParams {
  isHuizhang: boolean;
  isChaoguan: boolean;
  user?: { branchId?: number | null } | null;
}

// 数据录入页的数据加载与厅配置/奖励规则/冠名等级等状态管理
export function useDataEntryData({
  isHuizhang,
  isChaoguan,
  user,
}: UseDataEntryDataParams) {
  const toast = useToast();
  const [records, setRecords] = useState<DataRecord[]>([]);
  // 最近一次操作（录入/修改/删除）的备注：从后端 latest-remark 接口获取
  const [latestRemark, setLatestRemark] = useState<string | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([]);
  const [branchId, setBranchId] = useState<number | undefined>(undefined);
  // 合厅组选中 ID（与 branchId 互斥：选了合厅组则 branchId 为 undefined）
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);
  // loadData 竞态保护：每次调用自增，仅最后一次调用可写 state
  const loadIdRef = useRef(0);
  // loadPersonnel 竞态保护
  const personLoadIdRef = useRef(0);

  // 当前生效的厅ID（用于录入/导入）
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId;
    if (isChaoguan) return branchId ?? user?.branchId ?? undefined;
    return user?.branchId ?? undefined;
  }, [isHuizhang, isChaoguan, branchId, user]);

  // 是否处于合厅组模式
  const isGroupMode = selectedGroupId !== undefined;

  // 合厅组选中的对象
  const selectedGroup = useMemo(
    () => branchGroups.find((g) => g.id === selectedGroupId),
    [branchGroups, selectedGroupId],
  );

  // 合厅组成员厅 ID 列表（排除已关闭的厅）
  const effectiveBranchIds = useMemo(() => {
    if (!isGroupMode || !selectedGroup) return [];
    return selectedGroup.branches.filter((b) => !b.closed).map((b) => b.id);
  }, [isGroupMode, selectedGroup]);

  // 合厅组内各厅的统计周期
  const groupCycles = useMemo(() => {
    if (!isGroupMode || !selectedGroup) return new Set<StatCycle>();
    return new Set(
      selectedGroup.branches.filter((b) => !b.closed).map((b) => b.statCycle),
    );
  }, [isGroupMode, selectedGroup]);

  // 合厅组内统计周期是否不一致（周统计+月统计混合）
  const isMixedCycle = isGroupMode && groupCycles.size > 1;

  // 合厅组内各成员厅信息映射（用于按 branchId 查找 statCycle）
  const groupBranchMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string; statCycle: StatCycle }>();
    if (isGroupMode && selectedGroup) {
      for (const b of selectedGroup.branches) {
        map.set(b.id, { id: b.id, name: b.name, statCycle: b.statCycle });
      }
    }
    return map;
  }, [isGroupMode, selectedGroup]);

  // 当前厅的统计周期（直接跟随厅配置，按周就是按周，按月就是按月）
  // 合厅组模式：所有厅都是月统计 → MONTH；否则 → WEEK（混合时默认按周导航）
  const branchCycle: StatCycle = useMemo(() => {
    if (isGroupMode) {
      if (groupCycles.size === 1 && groupCycles.has("MONTH")) return "MONTH";
      return "WEEK";
    }
    const branch = branches.find((b) => b.id === effectiveBranchId);
    return branch?.statCycle ?? "WEEK";
  }, [branches, effectiveBranchId, isGroupMode, groupCycles]);
  // 视图周期直接跟随厅配置
  const isMonthCycle = branchCycle === "MONTH";

  // 日期导航：统一使用 usePeriodNavigator hook
  // 合厅组模式：根据 groupCycles 决定导航周期
  const navBranch = useMemo(() => {
    if (isGroupMode) {
      return { statCycle: branchCycle } as Pick<Branch, "statCycle">;
    }
    return branches.find((b) => b.id === effectiveBranchId) ?? null;
  }, [isGroupMode, branchCycle, branches, effectiveBranchId]);

  const {
    weekStart,
    setWeekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
  } = usePeriodNavigator({
    branch: navBranch,
  });

  // 当前厅的奖励规则：用于控制收光/全麦录入开关
  const [rewardRule, setRewardRule] = useState<RewardRule | null>(null);
  // 合厅组模式下各厅的奖励规则映射
  const [groupRewardRules, setGroupRewardRules] = useState<
    Map<number, RewardRule>
  >(new Map());
  // 合厅组模式下各厅的冠名等级映射
  const [groupNamingLevels, setGroupNamingLevels] = useState<
    Map<number, NamingLevel[]>
  >(new Map());

  // 合厅组模式：所有厅都显示收光/全麦列（取并集）
  const sgInputEnabled = isGroupMode ? true : rewardRule ? rewardRule.sgEnabled : true;
  const qmInputEnabled = isGroupMode ? true : rewardRule ? rewardRule.qmEnabled : true;
  const zcInputEnabled = isGroupMode
    ? Array.from(groupRewardRules.values()).some((r) => r.zcEnabled)
    : rewardRule
      ? rewardRule.zcEnabled
      : false;

  // 当前厅的冠名等级（仅按月统计厅有配置时加载）
  const [namingLevels, setNamingLevels] = useState<NamingLevel[]>([]);

  // 是否在编辑弹窗中显示冠名输入：仅按月统计厅且已配置冠名等级
  // 合厅组模式：有任意月统计厅配置了冠名等级即显示
  const editNamingsEnabled = isGroupMode
    ? groupNamingLevels.size > 0
    : branchCycle === "MONTH" && namingLevels.length > 0;

  // 切换厅/合厅组时根据统计周期重置 weekStart 到本周/本月
  const prevBranchCycleRef = useRef<StatCycle | null>(null);
  useEffect(() => {
    if (prevBranchCycleRef.current !== branchCycle) {
      prevBranchCycleRef.current = branchCycle;
      // 合厅组模式或已确定厅时重置
      if (isGroupMode || effectiveBranchId !== undefined) {
        if (branchCycle === "MONTH") {
          setWeekStart(getMonthStart());
        } else {
          setWeekStart(getWeekStart());
        }
      }
    }
  }, [branchCycle, effectiveBranchId, isGroupMode, setWeekStart]);

  // 录入目标周（YYYY-MM-DD）
  // 单厅模式：周统计厅=周一，月统计厅=月初1日
  // 合厅组模式：返回当前导航周/月（用于默认显示）
  const recordWeekStart = useMemo(() => {
    if (branchCycle === "MONTH") {
      const monthStart = new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        1,
      );
      monthStart.setHours(0, 0, 0, 0);
      return formatDate(monthStart);
    }
    return formatDate(weekStart);
  }, [branchCycle, weekStart]);

  // 获取指定厅的录入 weekStart（合厅组模式下按各厅 statCycle 计算）
  const getRecordWeekStart = useMemo(() => {
    return (branchId?: number): string => {
      if (!isGroupMode || branchId === undefined) {
        return recordWeekStart;
      }
      const branchInfo = groupBranchMap.get(branchId);
      if (branchInfo?.statCycle === "MONTH") {
        const monthStart = new Date(
          weekStart.getFullYear(),
          weekStart.getMonth(),
          1,
        );
        monthStart.setHours(0, 0, 0, 0);
        return formatDate(monthStart);
      }
      return formatDate(weekStart);
    };
  }, [isGroupMode, recordWeekStart, groupBranchMap, weekStart]);

  // 获取指定厅的统计周期
  const getBranchCycle = useMemo(() => {
    return (branchId?: number): StatCycle => {
      if (!isGroupMode || branchId === undefined) {
        return branchCycle;
      }
      return groupBranchMap.get(branchId)?.statCycle ?? "WEEK";
    };
  }, [isGroupMode, branchCycle, groupBranchMap]);

  // 获取指定厅的冠名等级
  const getNamingLevels = useMemo(() => {
    return (branchId?: number): NamingLevel[] => {
      if (!isGroupMode || branchId === undefined) {
        return namingLevels;
      }
      return groupNamingLevels.get(branchId) ?? [];
    };
  }, [isGroupMode, namingLevels, groupNamingLevels]);

  // 获取指定厅的奖励规则（用于编辑弹窗判断输入开关）
  const getRewardRule = useMemo(() => {
    return (branchId?: number): RewardRule | null => {
      if (!isGroupMode || branchId === undefined) {
        return rewardRule;
      }
      return groupRewardRules.get(branchId) ?? null;
    };
  }, [isGroupMode, rewardRule, groupRewardRules]);

  // 加载合厅组列表（会长查全部，超管查授权的合厅组）
  useEffect(() => {
    if (isHuizhang || isChaoguan) {
      branchGroupsApi
        .list()
        .then(setBranchGroups)
        .catch(() => {});
    }
  }, [isHuizhang, isChaoguan]);

  // 超管用户：如果默认所在厅已被合并到合厅组，自动选中该合厅组
  // 管理角色不自动选中合厅组（始终锁定到自己的单厅）
  useEffect(() => {
    if (
      isChaoguan &&
      branchGroups.length > 0 &&
      selectedGroupId === undefined &&
      branchId === undefined &&
      user?.branchId
    ) {
      const groupContainingUserBranch = branchGroups.find((g) =>
        g.branches.some((b) => b.id === user.branchId),
      );
      if (groupContainingUserBranch) {
        setSelectedGroupId(groupContainingUserBranch.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChaoguan, branchGroups, user?.branchId]);

  const loadData = async () => {
    // 合厅组模式：按各厅 statCycle 分别查询
    if (isGroupMode) {
      if (effectiveBranchIds.length === 0) {
        loadIdRef.current++;
        setRecords([]);
        setLatestRemark(null);
        setLoading(false);
        return;
      }
      const loadId = ++loadIdRef.current;
      setRecords([]);
      setLatestRemark(null);
      setLoading(true);
      try {
        // 按周期分组：周统计厅用 weekStart（周一），月统计厅用 monthStart（月初1日）
        const weekParam = formatDate(weekStart);
        const monthStart = getMonthStart(weekStart);
        const monthParam = formatDate(monthStart);

        const weekBranchIds = effectiveBranchIds.filter(
          (bid) => groupBranchMap.get(bid)?.statCycle !== "MONTH",
        );
        const monthBranchIds = effectiveBranchIds.filter(
          (bid) => groupBranchMap.get(bid)?.statCycle === "MONTH",
        );

        // 分别查询周统计厅和月统计厅的数据，并行请求
        const promises: Promise<DataRecord[]>[] = [];
        if (weekBranchIds.length > 0) {
          promises.push(
            dataQueryApi.listByWeek(weekParam, undefined, weekBranchIds),
          );
        }
        if (monthBranchIds.length > 0) {
          promises.push(
            dataQueryApi.listByWeek(monthParam, undefined, monthBranchIds),
          );
        }

        const results = await Promise.all(promises);
        if (loadId !== loadIdRef.current) return;
        // 合并所有查询结果
        const merged = results.flat();
        setRecords(merged);
        // 合厅组模式不查 latestRemark（多厅场景无意义）
      } catch (err) {
        if (loadId !== loadIdRef.current) return;
        toast.error(getErrorMessage(err));
      } finally {
        if (loadId === loadIdRef.current) {
          setLoading(false);
        }
      }
      return;
    }

    // 单厅模式：原有逻辑
    if (!effectiveBranchId) {
      loadIdRef.current++;
      setRecords([]);
      setLatestRemark(null);
      setLoading(false);
      return;
    }
    const loadId = ++loadIdRef.current;
    setRecords([]);
    setLatestRemark(null);
    setLoading(true);
    try {
      if (isMonthCycle) {
        const recs = await dataQueryApi.listByWeek(
          recordWeekStart,
          effectiveBranchId,
        );
        if (loadId !== loadIdRef.current) return;
        setRecords(recs);
      } else {
        const weekParam = formatDate(weekStart);
        const recs = await dataQueryApi.listByWeek(
          weekParam,
          effectiveBranchId,
        );
        if (loadId !== loadIdRef.current) return;
        setRecords(recs);
      }

      try {
        const remarkRes = await dataQueryApi.getLatestRemark(
          effectiveBranchId,
        );
        if (loadId === loadIdRef.current) {
          setLatestRemark(remarkRes.remark);
        }
      } catch {
        // 备注查询失败不影响主流程
      }
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      toast.error(getErrorMessage(err));
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadPersonnel = async () => {
    // 合厅组模式：批量查询所有成员厅的人员
    if (isGroupMode) {
      if (effectiveBranchIds.length === 0) {
        personLoadIdRef.current++;
        setPersonnel([]);
        return;
      }
      const loadId = ++personLoadIdRef.current;
      setPersonnel([]);
      try {
        const list = await personnelApi.listByBranches(effectiveBranchIds);
        if (loadId !== personLoadIdRef.current) return;
        setPersonnel(list);
      } catch (err) {
        if (loadId !== personLoadIdRef.current) return;
        toast.error(getErrorMessage(err));
      }
      return;
    }

    // 单厅模式：原有逻辑
    if (!effectiveBranchId) {
      personLoadIdRef.current++;
      setPersonnel([]);
      return;
    }
    const loadId = ++personLoadIdRef.current;
    setPersonnel([]);
    try {
      const list = await personnelApi.list(effectiveBranchId);
      if (loadId !== personLoadIdRef.current) return;
      setPersonnel(list);
    } catch (err) {
      if (loadId !== personLoadIdRef.current) return;
      toast.error(getErrorMessage(err));
    }
  };

  useEffect(() => {
    branchesApi
      .list()
      .then(setBranches)
      .catch(() => {});
  }, []);

  // 加载人员：合厅组模式或已确定厅时
  useEffect(() => {
    if (isGroupMode || effectiveBranchId !== undefined) {
      loadPersonnel();
    } else {
      setPersonnel([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, isGroupMode, effectiveBranchIds]);

  // 加载奖励规则
  useEffect(() => {
    if (isGroupMode) {
      // 合厅组模式：加载所有成员厅的奖励规则
      if (effectiveBranchIds.length === 0) {
        setGroupRewardRules(new Map());
        return;
      }
      Promise.all(
        effectiveBranchIds.map((bid) =>
          rewardRulesApi
            .get(bid)
            .then((rs) => [bid, rs[0] ?? null] as const)
            .catch(() => [bid, null] as const),
        ),
      ).then((entries) => {
        const map = new Map<number, RewardRule>();
        for (const [bid, rule] of entries) {
          if (rule) map.set(bid, rule);
        }
        setGroupRewardRules(map);
      });
    } else {
      // 单厅模式：原有逻辑
      if (effectiveBranchId !== undefined) {
        rewardRulesApi
          .get(effectiveBranchId)
          .then((rs) => setRewardRule(rs[0] ?? null))
          .catch(() => setRewardRule(null));
      } else {
        setRewardRule(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, isGroupMode, effectiveBranchIds]);

  // 加载冠名等级
  useEffect(() => {
    if (isGroupMode) {
      // 合厅组模式：加载所有月统计厅的冠名等级
      const monthBranchIds = effectiveBranchIds.filter(
        (bid) => groupBranchMap.get(bid)?.statCycle === "MONTH",
      );
      if (monthBranchIds.length === 0) {
        setGroupNamingLevels(new Map());
        return;
      }
      Promise.all(
        monthBranchIds.map((bid) =>
          namingLevelsApi
            .get(bid)
            .then((levels) => [bid, levels] as const)
            .catch(() => [bid, [] as NamingLevel[]] as const),
        ),
      ).then((entries) => {
        const map = new Map<number, NamingLevel[]>();
        for (const [bid, levels] of entries) {
          if (levels.length > 0) map.set(bid, levels);
        }
        setGroupNamingLevels(map);
      });
    } else {
      // 单厅模式：原有逻辑
      if (effectiveBranchId !== undefined && branchCycle === "MONTH") {
        namingLevelsApi
          .get(effectiveBranchId)
          .then(setNamingLevels)
          .catch(() => setNamingLevels([]));
      } else {
        setNamingLevels([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveBranchId,
    branchCycle,
    isGroupMode,
    effectiveBranchIds,
    groupBranchMap,
  ]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, effectiveBranchId, isMonthCycle, isGroupMode, effectiveBranchIds]);

  return {
    records,
    latestRemark,
    personnel,
    branches,
    branchGroups,
    branchId,
    setBranchId,
    selectedGroupId,
    setSelectedGroupId,
    isGroupMode,
    isMixedCycle,
    effectiveBranchIds,
    loading,
    effectiveBranchId,
    weekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
    branchCycle,
    isMonthCycle,
    recordWeekStart,
    getRecordWeekStart,
    getBranchCycle,
    getNamingLevels,
    getRewardRule,
    sgInputEnabled,
    qmInputEnabled,
    zcInputEnabled,
    namingLevels,
    editNamingsEnabled,
    loadData,
  };
}
