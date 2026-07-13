import { useEffect, useMemo, useRef, useState } from "react";
import {
  dataQueryApi,
  personnelApi,
  branchesApi,
  rewardRulesApi,
  namingLevelsApi,
  getErrorMessage,
} from "../api";
import { usePeriodNavigator } from "../hooks/usePeriodNavigator";
import { useToast } from "../hooks/useToast";
import { formatDate, getWeekStart } from "../utils";
import type {
  DataRecord,
  Personnel,
  Branch,
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
  const [branchId, setBranchId] = useState<number | undefined>(undefined);
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

  // 日期导航：统一使用 usePeriodNavigator hook
  const {
    weekStart,
    setWeekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
  } = usePeriodNavigator({
    branch: branches.find((b) => b.id === effectiveBranchId),
  });

  // 当前厅的奖励规则：用于控制收光/全麦录入开关
  const [rewardRule, setRewardRule] = useState<RewardRule | null>(null);
  const sgInputEnabled = rewardRule ? rewardRule.sgEnabled : true;
  const qmInputEnabled = rewardRule ? rewardRule.qmEnabled : true;
  const zcInputEnabled = rewardRule ? rewardRule.zcEnabled : false;

  // 当前厅的冠名等级（仅按月统计厅有配置时加载）
  const [namingLevels, setNamingLevels] = useState<NamingLevel[]>([]);

  // 当前厅的统计周期（直接跟随厅配置，按周就是按周，按月就是按月）
  const branchCycle: StatCycle = useMemo(() => {
    const branch = branches.find((b) => b.id === effectiveBranchId);
    return branch?.statCycle ?? "WEEK";
  }, [branches, effectiveBranchId]);
  // 视图周期直接跟随厅配置
  const isMonthCycle = branchCycle === "MONTH";
  // 是否在编辑弹窗中显示冠名输入：仅按月统计厅且已配置冠名等级
  const editNamingsEnabled = branchCycle === "MONTH" && namingLevels.length > 0;

  // 切换厅时根据厅统计周期重置 weekStart 到本周/本月
  // 原因：weekStart 可能是跨月周（如7月1日周二时本周周一是6月29日），切到月统计厅会用 getMonthStart(6月29日)=6月1日 查询上月数据
  // 周统计厅：本周周一；月统计厅：本月1日（对两种周期查询都正确）
  const prevBranchCycleRef = useRef<StatCycle | null>(null);
  useEffect(() => {
    if (prevBranchCycleRef.current !== branchCycle) {
      prevBranchCycleRef.current = branchCycle;
      if (effectiveBranchId !== undefined) {
        if (branchCycle === "MONTH") {
          const d = new Date();
          d.setDate(1);
          d.setHours(0, 0, 0, 0);
          setWeekStart(d);
        } else {
          setWeekStart(getWeekStart());
        }
      }
    }
  }, [branchCycle, effectiveBranchId, setWeekStart]);

  // 录入目标周（YYYY-MM-DD，周一）
  // 录入时使用的 weekStart：
  // 周统计厅：用户查看的周（周一，支持编辑历史周数据）
  // 月统计厅：用户查看月的1日（前端归一化为月初1日，避免依赖服务端时区）
  const recordWeekStart = useMemo(() => {
    if (branchCycle === "MONTH") {
      const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);
      return formatDate(monthStart);
    }
    return formatDate(weekStart);
  }, [branchCycle, weekStart]);

  const loadData = async () => {
    // 会长未选择厅时不加载任何数据
    if (!effectiveBranchId) {
      loadIdRef.current++;
      setRecords([]);
      setLatestRemark(null);
      setLoading(false);
      return;
    }
    // 竞态保护：每次调用自增，仅最后一次调用可写 state
    const loadId = ++loadIdRef.current;
    setRecords([]);
    setLatestRemark(null);
    setLoading(true);
    try {
      if (isMonthCycle) {
        // 月模式：月统计厅数据存储在月初1日，只查 recordWeekStart 这一天
        const recs = await dataQueryApi.listByWeek(
          recordWeekStart,
          effectiveBranchId,
        );
        if (loadId !== loadIdRef.current) return;
        setRecords(recs);
      } else {
        // 周模式：查询单周数据
        const weekParam = formatDate(weekStart);
        const recs = await dataQueryApi.listByWeek(
          weekParam,
          effectiveBranchId,
        );
        if (loadId !== loadIdRef.current) return;
        setRecords(recs);
      }

      // 查询当前厅最近一次操作（录入/修改/删除）的备注
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
    // 所有用户都需加载厅列表以获取统计周期
    branchesApi
      .list()
      .then(setBranches)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // 仅在已确定厅时加载人员
    if (effectiveBranchId !== undefined) {
      loadPersonnel();
    } else {
      setPersonnel([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId]);

  // 加载当前厅的奖励规则（用于控制收光/全麦录入开关）
  useEffect(() => {
    if (effectiveBranchId !== undefined) {
      rewardRulesApi
        .get(effectiveBranchId)
        .then((rs) => setRewardRule(rs[0] ?? null))
        .catch(() => setRewardRule(null));
    } else {
      setRewardRule(null);
    }
  }, [effectiveBranchId]);

  // 加载当前厅的冠名等级（用于编辑弹窗显示冠名输入框）
  useEffect(() => {
    if (effectiveBranchId !== undefined && branchCycle === "MONTH") {
      namingLevelsApi
        .get(effectiveBranchId)
        .then(setNamingLevels)
        .catch(() => setNamingLevels([]));
    } else {
      setNamingLevels([]);
    }
  }, [effectiveBranchId, branchCycle]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, effectiveBranchId, isMonthCycle]);

  return {
    records,
    latestRemark,
    personnel,
    branches,
    branchId,
    setBranchId,
    loading,
    effectiveBranchId,
    weekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
    branchCycle,
    isMonthCycle,
    recordWeekStart,
    sgInputEnabled,
    qmInputEnabled,
    zcInputEnabled,
    namingLevels,
    editNamingsEnabled,
    loadData,
  };
}
