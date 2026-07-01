import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Download,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  ClipboardPaste,
  CheckSquare,
  Save,
  UserPlus,
  Search,
  X,
} from "lucide-react";
import {
  dataRecordsApi,
  dataQueryApi,
  personnelApi,
  branchesApi,
  exportApi,
  rewardRulesApi,
  namingLevelsApi,
  deductionsApi,
  getErrorMessage,
} from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import SearchableSelect from "../components/SearchableSelect";
import { TableSkeleton, Spinner } from "../components/Skeleton";
import {
  formatDate,
  getWeekStart,
  getPreviousWeekStart,
  getWeekRangeText,
  getMonthRangeText,
  matchNamePinyin,
} from "../utils";
import type {
  DataRecord,
  Personnel,
  Branch,
  ImportResult,
  StatCycle,
  RewardRule,
  NamingItem,
  NamingLevel,
} from "../types";

type RecordForm = {
  personnelId: string;
  sg: string;
  mx: string;
  qm: string;
  // 主持天数（字符串便于输入控制）
  zcDays: string;
  // 冠名数量：levelId -> count（字符串便于输入控制）
  namings: Record<string, string>;
  // 福利扣减金额（字符串便于输入控制）
  deduction: string;
  // 操作备注（覆盖式存储到 DataRecord.remark）
  remark: string;
};

const emptyForm: RecordForm = {
  personnelId: "",
  sg: "",
  mx: "",
  qm: "",
  zcDays: "",
  namings: {},
  deduction: "",
  remark: "",
};

// 冠名展示格式：如 "周冠×2 月冠×1"，无则返回 '-'
function formatNamings(namings?: NamingItem[]): string {
  if (!namings || namings.length === 0) return "-";
  return (
    namings
      .filter((n) => n.count > 0)
      .map((n) => `${n.levelName}×${n.count}`)
      .join(" ") || "-"
  );
}

// 累加两个 namings 数组（按 levelId 合并 count，reward 取首次出现的值）
function mergeNamings(
  a?: NamingItem[],
  b?: NamingItem[],
): NamingItem[] | undefined {
  if (!a || a.length === 0) return b;
  if (!b || b.length === 0) return a;
  const map = new Map<number, NamingItem>();
  for (const n of a) map.set(n.levelId, { ...n });
  for (const n of b) {
    const cur = map.get(n.levelId);
    if (cur) {
      cur.count += n.count;
    } else {
      map.set(n.levelId, { ...n });
    }
  }
  return Array.from(map.values());
}

export default function DataEntry() {
  const { user } = useAuth();
  const toast = useToast();
  const isHuizhang = user?.role === "HUIZHANG";
  const canDelete = isHuizhang || user?.role === "CHAOGUAN";

  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [records, setRecords] = useState<DataRecord[]>([]);
  // 最近一次操作（录入/修改/删除）的备注：从后端 latest-remark 接口获取
  const [latestRemark, setLatestRemark] = useState<string | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  // loadData 竞态保护：每次调用自增，仅最后一次调用可写 state
  const loadIdRef = useRef(0);

  // 人员搜索框（用于过滤列表，替代原手动录入卡片的人员选择）
  const [searchTerm, setSearchTerm] = useState("");
  // 列表排序：null=按录入顺序，'sg'/'mx'/'qm'/'welfare'=按对应指标降序
  const [sortKey, setSortKey] = useState<"sg" | "mx" | "qm" | "welfare" | null>(
    null,
  );
  // 分页：每页最多 30 人
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // 编辑弹窗独立状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<RecordForm>(emptyForm);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"excel" | "paste">("excel");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pasteData, setPasteData] = useState("");
  const [importing, setImporting] = useState(false);
  const [importRemark, setImportRemark] = useState("");
  const [exporting, setExporting] = useState<"excel" | "csv" | null>(null);

  // 导出弹窗状态：可选按周/按月 + 历史周/月
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCycle, setExportCycle] = useState<"WEEK" | "MONTH">("WEEK");
  const [exportWeeks, setExportWeeks] = useState<string[]>([]);
  const [exportDate, setExportDate] = useState<string>(
    formatDate(getWeekStart()),
  );

  // 批量编辑状态
  // 选中行标识：用 `${branchId}:${personnelId}` 区分多厅下的同一人员
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 构造行 key 的辅助函数
  const rowKey = (branchId: number | undefined, personnelId: number) =>
    `${branchId ?? 0}:${personnelId}`;
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  // 每行的编辑表单：行 key（`${branchId}:${personnelId}`）-> { sg, mx, qm, zcDays }
  const [batchForms, setBatchForms] = useState<
    Record<string, { sg: string; mx: string; qm: string; zcDays: string }>
  >({});
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  // 批量编辑/添加的共用备注
  const [batchRemark, setBatchRemark] = useState("");

  // 批量添加状态：表格化批量录入
  const [batchAddOpen, setBatchAddOpen] = useState(false);
  const [batchAddForms, setBatchAddForms] = useState<
    Record<string, { sg: string; mx: string; qm: string; zcDays: string }>
  >({});
  const [batchAddSubmitting, setBatchAddSubmitting] = useState(false);

  // 当前生效的厅ID（用于录入/导入）
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId;
    return user?.branchId ?? undefined;
  }, [isHuizhang, branchId, user]);

  // 当前厅的奖励规则：用于控制收光/全麦录入开关
  const [rewardRule, setRewardRule] = useState<RewardRule | null>(null);
  // 收光/全麦是否可录入（厅规则关闭时禁用对应输入）
  const sgInputEnabled = rewardRule ? rewardRule.sgEnabled : true;
  const qmInputEnabled = rewardRule ? rewardRule.qmEnabled : true;
  // 主持天数是否可录入（厅管理页开启主持福利后才启用，默认关闭）
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
  }, [branchCycle, effectiveBranchId]);

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

  // 最近一条操作（录入/修改/删除）的备注：从后端 latest-remark 接口获取
  // 显示在搜索框后面，让用户快速看到当前周最近一次操作的备注

  const loadData = async () => {
    // 会长未选择厅时不加载任何数据（数据录入页面仅支持独立厅显示）
    if (!effectiveBranchId) {
      loadIdRef.current++;
      setRecords([]);
      setLatestRemark(null);
      setLoading(false);
      return;
    }
    // 竞态保护：每次调用自增，仅最后一次调用可写 state
    const loadId = ++loadIdRef.current;
    // 切换条件变化时先清空旧数据，避免显示上一个厅/周/月的残留数据
    setRecords([]);
    setLatestRemark(null);
    setLoading(true);
    try {
      if (isMonthCycle) {
        // 月模式：月统计厅数据存储在月初1日（recordWeekStart）
        // 兼容旧数据：同时查询该月所有周一，合并结果
        const year = weekStart.getFullYear();
        const month = weekStart.getMonth();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        const firstWeekStart = getWeekStart(monthStart);
        const lastWeekStart = getWeekStart(monthEnd);
        // 收集查询日期：月初1日 + 该月所有周一（兼容旧数据按周存储）
        const queryDates = new Set<string>();
        queryDates.add(formatDate(monthStart));
        let cur = new Date(firstWeekStart);
        while (cur <= lastWeekStart) {
          queryDates.add(formatDate(cur));
          const next = new Date(cur);
          next.setDate(next.getDate() + 7);
          cur = next;
        }
        // 并发查询所有日期数据
        const allResults = await Promise.all(
          [...queryDates].map((w) => dataQueryApi.listByWeek(w, effectiveBranchId)),
        );
        // 竞态保护：若期间又有新的 loadData 调用，丢弃本次结果
        if (loadId !== loadIdRef.current) return;
        // 按 (branchId, personnelId) 合并累加，避免多厅数据混合
        const mergedMap = new Map<
          string,
          DataRecord & { sg: number; mx: number; qm: number; weekStart: string }
        >();
        for (const weekRecs of allResults) {
          for (const r of weekRecs) {
            const key = `${r.branchId}:${r.personnelId}`;
            const existing = mergedMap.get(key);
            if (existing) {
              existing.sg += r.sg;
              existing.mx += r.mx;
              existing.qm += r.qm;
              existing.welfare = (existing.welfare ?? 0) + (r.welfare ?? 0);
              existing.namings = mergeNamings(existing.namings, r.namings);
              if (!existing.deduction) existing.deduction = r.deduction;
            } else {
              mergedMap.set(key, { ...r });
            }
          }
        }
        const mergedRecords = [...mergedMap.values()].map((r) => ({
          ...r,
          finalWelfare:
            r.welfare !== undefined && r.deduction !== undefined
              ? r.welfare - r.deduction
              : r.welfare,
        }));
        setRecords(mergedRecords);
      } else {
        // 周模式：查询单周数据
        const weekParam = formatDate(weekStart);
        const recs = await dataQueryApi.listByWeek(
          weekParam,
          effectiveBranchId,
        );
        // 竞态保护：若期间又有新的 loadData 调用，丢弃本次结果
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
      // 仅最后一次调用的 finally 才关闭 loading
      if (loadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  };

  // loadPersonnel 竞态保护：与 loadIdRef 同样的机制
  const personLoadIdRef = useRef(0);
  const loadPersonnel = async () => {
    // 会长未选择厅时不加载人员（数据录入页面仅支持独立厅显示）
    if (!effectiveBranchId) {
      personLoadIdRef.current++;
      setPersonnel([]);
      return;
    }
    const loadId = ++personLoadIdRef.current;
    // 切换厅时先清空，避免旧厅人员残留导致列表错乱
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
    // 仅在已确定厅时加载人员（会长未选厅不加载）
    if (effectiveBranchId !== undefined) {
      loadPersonnel();
    } else {
      setPersonnel([]);
    }
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

  const handlePrevWeek = () => {
    if (isMonthCycle) {
      // 月模式：往前推一个月，直接设置月初1号（避免 getWeekStart 导致月份错乱）
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth() - 1, 1);
      setWeekStart(d);
    } else {
      setWeekStart(getPreviousWeekStart(weekStart));
    }
  };
  const handleNextWeek = () => {
    if (isMonthCycle) {
      // 月模式：往后推一个月，不超过当前月
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 1);
      const thisMonthStart = new Date();
      thisMonthStart.setDate(1);
      thisMonthStart.setHours(0, 0, 0, 0);
      if (d <= thisMonthStart) setWeekStart(d);
    } else {
      const next = new Date(weekStart);
      next.setDate(next.getDate() + 7);
      if (next <= getWeekStart()) setWeekStart(next);
    }
  };

  // 编辑弹窗人员下拉选项（由当前厅人员列表派生）
  const personnelOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [personnel],
  );

  // 打开编辑弹窗
  const handleEdit = (record: DataRecord) => {
    setEditingId(record.id);
    // 填充现有冠名数量：基于当前厅的冠名等级初始化（值为 0 时显示空字符串便于输入）
    const namingMap: Record<string, string> = {};
    if (editNamingsEnabled) {
      const existingMap = new Map<number, number>();
      for (const n of record.namings ?? []) {
        existingMap.set(n.levelId, n.count);
      }
      for (const lv of namingLevels) {
        const cnt = existingMap.get(lv.id) ?? 0;
        namingMap[String(lv.id)] = cnt ? String(cnt) : "";
      }
    }
    setEditForm({
      personnelId: String(record.personnelId),
      sg: record.sg ? String(record.sg) : "",
      mx: record.mx ? String(record.mx) : "",
      qm: record.qm ? String(record.qm) : "",
      zcDays: String(record.zcDays ?? 0),
      namings: namingMap,
      deduction: record.deduction ? String(record.deduction) : "",
      // 备注不预填历史值，每次编辑都需要重新填写
      remark: "",
    });
    setEditModalOpen(true);
  };

  // 编辑弹窗提交
  const handleEditSubmit = async () => {
    if (!editingId) return;
    if (!editForm.personnelId) {
      toast.error("请选择人员");
      return;
    }
    // 备注必填
    if (!editForm.remark.trim()) {
      toast.error("请填写备注");
      return;
    }
    // 厅规则关闭收光/全麦转换时，对应字段强制为 0 不参与录入
    const sg = sgInputEnabled ? Number(editForm.sg) : 0;
    const mx = Number(editForm.mx);
    const qm = qmInputEnabled ? Number(editForm.qm) : 0;
    const zcDays = zcInputEnabled ? Number(editForm.zcDays) : 0;
    if (
      (sgInputEnabled && (!Number.isInteger(sg) || sg < 0)) ||
      !Number.isInteger(mx) ||
      mx < 0 ||
      (qmInputEnabled && (!Number.isInteger(qm) || qm < 0)) ||
      (zcInputEnabled && (!Number.isInteger(zcDays) || zcDays < 0))
    ) {
      toast.error("收光/麦序/全麦/主持天数必须为非负整数");
      return;
    }

    // 扣减金额校验（会长+超管+管理可编辑）
    const deductionRaw = editForm.deduction.trim();
    const deduction = deductionRaw === "" ? 0 : Number(deductionRaw);
    const canEditDeduction = isHuizhang || user?.role === "CHAOGUAN" || user?.role === "GUANLI";
    if (canEditDeduction && (!Number.isInteger(deduction) || deduction < 0)) {
      toast.error("扣减金额必须为非负整数");
      return;
    }

    // 校验并构造冠名数量数组（仅按月统计厅启用）
    let namings: { levelId: number; count: number }[] | undefined;
    if (editNamingsEnabled) {
      namings = [];
      for (const lv of namingLevels) {
        const raw = editForm.namings[String(lv.id)] ?? "0";
        const cnt = Number(raw);
        if (!Number.isInteger(cnt) || cnt < 0) {
          toast.error(`冠名「${lv.name}」必须为非负整数`);
          return;
        }
        namings.push({ levelId: lv.id, count: cnt });
      }
    }

    setEditSubmitting(true);
    try {
      const payload: {
        sg: number;
        mx: number;
        qm: number;
        zcDays: number;
        personnelId?: number;
        namings?: { levelId: number; count: number }[];
        remark?: string;
      } = { sg, mx, qm, zcDays };
      if (namings) payload.namings = namings;
      // 备注始终传递（覆盖式存储：空字符串会清空备注）
      payload.remark = editForm.remark.trim();
      const original = records.find((r) => r.id === editingId);
      const targetPersonnelId =
        original && original.personnelId !== Number(editForm.personnelId)
          ? Number(editForm.personnelId)
          : original?.personnelId;
      if (original && original.personnelId !== Number(editForm.personnelId)) {
        payload.personnelId = Number(editForm.personnelId);
      }
      await dataRecordsApi.update(editingId, payload);

      // 保存扣减（仅会长+超管，且必须有厅和人员）
      // 扣减周期必须基于厅的统计周期（branchCycle），而非用户视图周期（isMonthCycle），
      // 否则与 data-query.ts 查询时的周期匹配不一致，会导致扣减保存了但查不到
      // 扣减为 0 时删除记录（实现"可增删"语义），正值时 upsert
      if (canEditDeduction && effectiveBranchId && targetPersonnelId) {
        const cycleParam: "WEEK" | "MONTH" =
          branchCycle === "MONTH" ? "MONTH" : "WEEK";
        const weekParam = formatDate(
          branchCycle === "MONTH"
            ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
            : weekStart,
        );
        try {
          if (deduction === 0) {
            // 扣减为 0：删除该周期扣减记录（清零）
            await deductionsApi.remove({
              branchId: effectiveBranchId,
              personnelId: targetPersonnelId,
              weekStart: weekParam,
              cycle: cycleParam,
            });
          } else {
            // 正值：upsert 覆盖旧值（可增可减）
            await deductionsApi.upsert({
              branchId: effectiveBranchId,
              personnelId: targetPersonnelId,
              weekStart: weekParam,
              cycle: cycleParam,
              amount: deduction,
            });
          }
        } catch (err) {
          // 扣减保存失败不阻塞主流程，仅提示
          toast.error("数据已更新，但扣减保存失败：" + getErrorMessage(err));
        }
      }

      toast.success("修改成功");
      setEditModalOpen(false);
      setEditingId(null);
      // 重置表单（含备注），避免下次打开弹窗时残留上次输入的备注
      setEditForm(emptyForm);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  // 删除确认弹窗（含备注输入）
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteRemark, setDeleteRemark] = useState("");

  const handleDelete = (id: number) => {
    setDeleteTargetId(id);
    setDeleteRemark("");
  };

  const handleDeleteConfirm = async () => {
    if (deleteTargetId === null) return;
    // 备注必填
    if (!deleteRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    try {
      await dataRecordsApi.delete(
        deleteTargetId,
        deleteRemark.trim(),
      );
      toast.success("删除成功");
      setDeleteTargetId(null);
      setDeleteRemark("");
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // 打开导出弹窗：加载历史周次列表，默认选中当前周/月
  // 导出周期固定跟随当前厅的 statCycle，按周厅只能导出按周，按月厅只能导出按月
  const handleOpenExport = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请先选择厅" : "当前账户未关联厅");
      return;
    }
    try {
      const list = await dataQueryApi.getWeeks(effectiveBranchId);
      // 合并历史周次与本周，统一格式化 YYYY-MM-DD 去重
      const set = new Set<string>();
      list.forEach((w) => set.add(formatDate(new Date(w))));
      set.add(formatDate(getWeekStart()));
      const sorted = Array.from(set).sort().reverse();
      setExportWeeks(sorted);
      // 导出周期跟随厅配置
      setExportCycle(branchCycle);
      if (branchCycle === "MONTH") {
        const d = new Date();
        d.setDate(1);
        setExportDate(formatDate(d));
      } else {
        setExportDate(formatDate(getWeekStart()));
      }
      setExportOpen(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // 导出：按所选周期和日期导出 Excel/CSV
  const handleExport = async (type: "excel" | "csv") => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请先选择厅" : "当前账户未关联厅");
      return;
    }
    setExporting(type);
    try {
      const dateParam = exportDate;
      const blob =
        type === "excel"
          ? await exportApi.exportExcel(
              dateParam,
              effectiveBranchId,
              exportCycle,
            )
          : await exportApi.exportCSV(
              dateParam,
              effectiveBranchId,
              exportCycle,
            );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const branchName =
        branches.find((b) => b.id === effectiveBranchId)?.name ?? "全部厅";
      const prefix = exportCycle === "MONTH" ? "月排名" : "周排名";
      a.download = `${branchName}_${prefix}_${dateParam}.${type === "excel" ? "xlsx" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const handleImport = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    // 备注必填
    if (!importRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    setImporting(true);
    try {
      let result: ImportResult;
      if (importTab === "excel") {
        if (!excelFile) {
          toast.error("请选择Excel文件");
          setImporting(false);
          return;
        }
        result = await dataRecordsApi.importExcel(
          excelFile,
          effectiveBranchId,
          recordWeekStart,
          importRemark.trim() || undefined,
        );
      } else {
        if (!pasteData.trim()) {
          toast.error("请粘贴数据");
          setImporting(false);
          return;
        }
        result = await dataRecordsApi.importPaste(
          pasteData,
          effectiveBranchId,
          recordWeekStart,
          importRemark.trim() || undefined,
        );
      }
      toast.success(
        `导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`,
      );
      if (result.createdPersons && result.createdPersons.length > 0) {
        toast.info(
          `已自动创建 ${result.createdPersons.length} 名人员：${result.createdPersons.join("、")}`,
        );
      }
      if (result.failures.length > 0) {
        console.warn("导入失败详情：", result.failures);
      }
      setImportOpen(false);
      setExcelFile(null);
      setPasteData("");
      setImportRemark("");
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  // 导出弹窗：从历史周次提取不重复月份（每月取最早周一作为参考日）
  const exportMonths = useMemo(() => {
    const monthMap = new Map<string, string>(); // YYYY-MM -> refDate(YYYY-MM-DD)
    const addMonth = (dateStr: string) => {
      const formatted = formatDate(new Date(dateStr));
      const d = new Date(formatted);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) monthMap.set(key, formatted);
    };
    exportWeeks.forEach(addMonth);
    // 补充本月
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    addMonth(formatDate(thisMonthStart));
    return Array.from(monthMap.entries())
      .map(([key, ref]) => ({ key, ref }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [exportWeeks]);

  // 多选：切换某行选中状态（按 `${branchId}:${personnelId}` 区分多厅下的同一人员）
  const handleToggleSelect = (
    branchId: number | undefined,
    personnelId: number,
  ) => {
    const key = rowKey(branchId, personnelId);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 表格数据：所有人员都显示，未录入的显示空行
  // 行数据：已录入的记录 + 未录入的人员占位行
  type DisplayRow = {
    key: string;
    id: number;
    personnelId: number;
    branchId?: number;
    personnelName: string;
    branchName?: string;
    sg: number;
    mx: number;
    qm: number;
    zcDays: number;
    welfare?: number;
    deduction?: number;
    finalWelfare?: number;
    createdAt?: string;
    isRecorded: boolean;
    namings?: NamingItem[];
  };
  // 全部行（不受搜索框过滤）：用于批量编辑/添加弹窗内显示所有已勾选人员
  const allRows = useMemo<DisplayRow[]>(() => {
    // 已录入的人员标识集合：用 `${branchId}:${personnelId}` 区分多厅
    const recordedKeys = new Set(
      records.map((r) => `${r.branchId}:${r.personnelId}`),
    );
    // 未录入：单厅模式匹配该厅，全部厅模式只要任一厅有记录就不算未录入
    const unrecorded = personnel.filter((p) => {
      if (effectiveBranchId) {
        return !recordedKeys.has(`${effectiveBranchId}:${p.id}`);
      }
      return !records.some((r) => r.personnelId === p.id);
    });
    // 已录入记录按 sortKey 降序排序（高值在前，相同保持原顺序）；null=不排序
    const sortedRecords = sortKey
      ? [...records].sort((a, b) => {
          const av =
            sortKey === "welfare"
              ? (a.finalWelfare ?? a.welfare ?? 0)
              : a[sortKey];
          const bv =
            sortKey === "welfare"
              ? (b.finalWelfare ?? b.welfare ?? 0)
              : b[sortKey];
          return bv - av;
        })
      : records;
    return [
      ...sortedRecords.map((r) => ({
        key: `rec-${r.id}`,
        id: r.id,
        personnelId: r.personnelId,
        branchId: r.branchId,
        personnelName: r.personnelName || r.personnel?.name || "-",
        branchName: r.branchName || r.branch?.name || "-",
        sg: r.sg,
        mx: r.mx,
        qm: r.qm,
        zcDays: r.zcDays ?? 0,
        welfare: r.welfare,
        deduction: r.deduction,
        finalWelfare: r.finalWelfare,
        createdAt: r.createdAt,
        isRecorded: true,
        namings: r.namings,
      })),
      ...unrecorded.map((p) => ({
        key: `empty-${p.id}`,
        id: 0,
        personnelId: p.id,
        branchId: effectiveBranchId ?? p.branches?.[0]?.id,
        personnelName: p.name,
        branchName:
          p.branches?.find(
            (b) => !effectiveBranchId || b.id === effectiveBranchId,
          )?.name || p.branches?.[0]?.name,
        sg: 0,
        mx: 0,
        qm: 0,
        zcDays: 0,
        welfare: undefined,
        createdAt: undefined,
        isRecorded: false,
        namings: undefined,
      })),
    ];
  }, [records, personnel, effectiveBranchId, sortKey]);

  // 受搜索框过滤的行：用于表格列表显示
  const filteredRecords = useMemo<DisplayRow[]>(() => {
    const term = searchTerm.trim();
    if (!term) return allRows;
    return allRows.filter((r) => matchNamePinyin(r.personnelName, term));
  }, [allRows, searchTerm]);

  // 全选/取消全选（仅当前可见行，按行 key 区分多厅）
  const handleToggleSelectAll = () => {
    setSelectedKeys((prev) => {
      const visibleKeys = pagedRecords.map((r) =>
        rowKey(r.branchId, r.personnelId),
      );
      if (visibleKeys.every((k) => prev.has(k))) {
        // 全部已选中：取消选中当前可见行
        const next = new Set(prev);
        visibleKeys.forEach((k) => next.delete(k));
        return next;
      }
      // 未全选：选中所有可见行
      const next = new Set(prev);
      visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  // 分页切片：当前页应显示的记录
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRecords = useMemo(
    () => filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRecords, safePage],
  );
  // 搜索或切换厅时重置到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, effectiveBranchId]);

  // 打开批量编辑弹窗：初始化每个选中行的表单数据
  const handleOpenBatchEdit = () => {
    if (selectedKeys.size === 0) {
      toast.error("请先勾选要批量编辑的人员");
      return;
    }
    const forms: Record<string, { sg: string; mx: string; qm: string; zcDays: string }> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        // 值为 0 时显示空字符串，便于用户直接输入新值
        forms[key] = {
          sg: r.isRecorded && r.sg ? String(r.sg) : "",
          mx: r.isRecorded && r.mx ? String(r.mx) : "",
          qm: r.isRecorded && r.qm ? String(r.qm) : "",
          zcDays: r.isRecorded && r.zcDays ? String(r.zcDays) : "",
        };
      }
    });
    setBatchForms(forms);
    setBatchEditOpen(true);
  };

  // 批量编辑：更新某行某字段
  const handleBatchFieldChange = (
    key: string,
    field: "sg" | "mx" | "qm" | "zcDays",
    value: string,
  ) => {
    setBatchForms((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  // 批量保存：逐条 create/update
  const handleBatchSubmit = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    // 备注必填
    if (!batchRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    // 校验所有表单数据
    const entries = Object.entries(batchForms);
    if (entries.length === 0) {
      toast.error("无数据可保存");
      return;
    }
    // 解析并校验（key 格式为 `${branchId}:${personnelId}`）
    const parsed: Array<{
      personnelId: number;
      branchId: number;
      sg: number;
      mx: number;
      qm: number;
      zcDays: number;
      recordId: number; // 0 表示未录入需新建
    }> = [];
    for (const [key, f] of entries) {
      const [bidStr, pidStr] = key.split(":");
      const branchId = Number(bidStr);
      const personnelId = Number(pidStr);
      // 厅规则关闭收光/全麦转换时，对应字段强制为 0 不参与录入
      const sg = sgInputEnabled ? Number(f.sg) : 0;
      const mx = Number(f.mx);
      const qm = qmInputEnabled ? Number(f.qm) : 0;
      const zcDays = !zcInputEnabled ? 0 : f.zcDays === "" ? 0 : Number(f.zcDays);
      if (
        (sgInputEnabled && (!Number.isInteger(sg) || sg < 0)) ||
        !Number.isInteger(mx) ||
        mx < 0 ||
        (qmInputEnabled && (!Number.isInteger(qm) || qm < 0)) ||
        (zcInputEnabled && (!Number.isInteger(zcDays) || zcDays < 0))
      ) {
        toast.error("收光/麦序/全麦/主持天数必须为非负整数");
        return;
      }
      const row = allRows.find(
        (r) => r.personnelId === personnelId && r.branchId === branchId,
      );
      parsed.push({
        personnelId,
        branchId: row?.branchId ?? branchId,
        sg,
        mx,
        qm,
        zcDays,
        recordId: row?.id ?? 0,
      });
    }

    setBatchSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      // 串行执行避免并发冲突
      for (const item of parsed) {
        try {
          if (item.recordId > 0) {
            // 已有记录：更新（含备注）
            await dataRecordsApi.update(item.recordId, {
              sg: item.sg,
              mx: item.mx,
              qm: item.qm,
              zcDays: item.zcDays,
              remark: batchRemark.trim(),
            });
          } else {
            // 未录入：新建（按行匹配的 branchId，含备注）
            await dataRecordsApi.create({
              personnelId: item.personnelId,
              branchId: item.branchId,
              sg: item.sg,
              mx: item.mx,
              qm: item.qm,
              zcDays: item.zcDays,
              weekStart: recordWeekStart,
              remark: batchRemark.trim() || undefined,
            });
          }
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        toast.success(`批量保存成功，共 ${successCount} 条`);
      } else {
        toast.error(`部分失败：成功 ${successCount} 条，失败 ${failCount} 条`);
      }
      setBatchEditOpen(false);
      setSelectedKeys(new Set());
      setBatchRemark("");
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBatchSubmitting(false);
    }
  };

  // 批量添加：打开弹窗，仅列出勾选的行，输入框为空（累加值）
  const handleOpenBatchAdd = () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    if (selectedKeys.size === 0) {
      toast.error("请先勾选要批量添加的人员");
      return;
    }
    const forms: Record<string, { sg: string; mx: string; qm: string; zcDays: string }> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        // 输入框初始为空，输入的是要累加的数值
        forms[key] = { sg: "", mx: "", qm: "", zcDays: "" };
      }
    });
    setBatchAddForms(forms);
    setBatchAddOpen(true);
  };

  // 批量添加：更新某行某字段
  const handleBatchAddFieldChange = (
    key: string,
    field: "sg" | "mx" | "qm" | "zcDays",
    value: string,
  ) => {
    setBatchAddForms((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  // 批量添加提交：累加到已录入数据上（已录入则原值+输入值，未录入则新建为输入值）
  const handleBatchAddSubmit = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    // 备注必填
    if (!batchRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    const entries = Object.entries(batchAddForms);
    if (entries.length === 0) {
      toast.error("无数据可保存");
      return;
    }
    // 解析并校验（key 格式为 `${branchId}:${personnelId}`）
    const parsed: Array<{
      personnelId: number;
      branchId: number;
      // 本次要累加的增量值
      sg: number;
      mx: number;
      qm: number;
      zcDays: number;
    }> = [];
    for (const [key, f] of entries) {
      const [bidStr, pidStr] = key.split(":");
      const branchId = Number(bidStr);
      const personnelId = Number(pidStr);
      // 空值视为 0（即不累加）；厅规则关闭收光/全麦转换时，对应字段强制为 0
      const addSg = !sgInputEnabled ? 0 : f.sg === "" ? 0 : Number(f.sg);
      const addMx = f.mx === "" ? 0 : Number(f.mx);
      const addQm = !qmInputEnabled ? 0 : f.qm === "" ? 0 : Number(f.qm);
      const addZcDays = !zcInputEnabled ? 0 : f.zcDays === "" ? 0 : Number(f.zcDays);
      if (
        (sgInputEnabled && (!Number.isInteger(addSg) || addSg < 0)) ||
        !Number.isInteger(addMx) ||
        addMx < 0 ||
        (qmInputEnabled && (!Number.isInteger(addQm) || addQm < 0)) ||
        (zcInputEnabled && (!Number.isInteger(addZcDays) || addZcDays < 0))
      ) {
        toast.error("收光/麦序/全麦/主持天数必须为非负整数");
        return;
      }
      // 跳过无输入的（避免创建全 0 的空记录）
      if (addSg === 0 && addMx === 0 && addQm === 0 && addZcDays === 0) continue;
      parsed.push({
        personnelId,
        branchId,
        sg: addSg,
        mx: addMx,
        qm: addQm,
        zcDays: addZcDays,
      });
    }

    if (parsed.length === 0) {
      toast.error("所有人员均未输入数据");
      return;
    }

    setBatchAddSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      // 统一使用 create（增量语义）：后端 upsertRecord 会自动累加并触发冠名转换
      for (const item of parsed) {
        try {
          await dataRecordsApi.create({
            personnelId: item.personnelId,
            branchId: item.branchId,
            sg: item.sg,
            mx: item.mx,
            qm: item.qm,
            zcDays: item.zcDays,
            weekStart: recordWeekStart,
            remark: batchRemark.trim() || undefined,
          });
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        toast.success(`批量添加成功，共 ${successCount} 条`);
      } else {
        toast.error(`部分失败：成功 ${successCount} 条，失败 ${failCount} 条`);
      }
      setBatchAddOpen(false);
      setSelectedKeys(new Set());
      setBatchRemark("");
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBatchAddSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 未选厅时仅显示厅选择器，不显示日期控件 */}
        {effectiveBranchId ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevWeek}
              className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-4 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary min-w-[220px] text-center">
              {isMonthCycle
                ? getMonthRangeText(weekStart)
                : getWeekRangeText(weekStart)}
            </div>
            <button
              onClick={handleNextWeek}
              className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                if (isMonthCycle) {
                  // 月模式：回到本月1号
                  const d = new Date();
                  d.setDate(1);
                  d.setHours(0, 0, 0, 0);
                  setWeekStart(d);
                } else {
                  setWeekStart(getWeekStart());
                }
              }}
              className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              {isMonthCycle ? "本月" : "本周"}
            </button>
            {/* 厅配置统计周期标签 */}
            {branchCycle === "MONTH" && (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                title="该厅配置为按月统计"
              >
                月统计厅
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm text-textMuted">请先选择厅</div>
        )}

        <div className="flex items-center gap-2">
          {isHuizhang && (
            <select
              value={branchId ?? ""}
              onChange={(e) =>
                setBranchId(e.target.value ? Number(e.target.value) : undefined)
              }
              className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            >
              <option value="">选择厅</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={handleOpenBatchEdit}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <CheckSquare size={16} />
              编辑（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={handleOpenBatchAdd}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <UserPlus size={16} />
              添加（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={() => setSelectedKeys(new Set())}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textSecondary hover:border-danger hover:text-danger transition-colors duration-200 cursor-pointer"
              title="取消所有选择"
            >
              <X size={16} />
              取消选择
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            disabled={!effectiveBranchId}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary hover:text-textPrimary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            title={!effectiveBranchId ? "请先选择厅" : undefined}
          >
            <Upload size={16} />
            导入
          </button>
          {canDelete && (
            <button
              onClick={handleOpenExport}
              disabled={!effectiveBranchId}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              title={!effectiveBranchId ? "请先选择厅" : undefined}
            >
              <Download size={16} />
              导出
            </button>
          )}
        </div>
      </div>

      {/* 人员搜索框（用于过滤下方列表，录入请使用勾选行后的"添加"按钮） */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索人员姓名"
              className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          {/* 最近一条录入备注：搜索框后展示 */}
          {latestRemark && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary max-w-md truncate"
              title={latestRemark}
            >
              <span className="text-textMuted">最近备注：</span>
              <span className="truncate">{latestRemark}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-textSecondary">排序</span>
            <select
              value={sortKey ?? ""}
              onChange={(e) =>
                setSortKey(
                  (e.target.value || null) as
                    "sg" | "mx" | "qm" | "welfare" | null,
                )
              }
              className="px-2 py-1.5 border border-border rounded-lg text-xs bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            >
              <option value="">默认</option>
              <option value="mx">麦序</option>
              <option value="sg">收光</option>
              {qmInputEnabled && <option value="qm">全麦</option>}
              <option value="welfare">福利</option>
            </select>
          </div>
          <span className="text-xs text-textSecondary ml-auto">
            共 {filteredRecords.length} 人
          </span>
        </div>
      </div>

      {/* 录入明细：weekStart/effectiveBranchId 变化时重新触发入场动画 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${formatDate(weekStart)}-${effectiveBranchId ?? "all"}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {loading && records.length === 0 ? (
            <TableSkeleton rows={6} columns={8} />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface border-b border-border">
                    <tr className="text-left text-textSecondary">
                      <th className="px-3 py-3 font-medium w-10">
                        <input
                          type="checkbox"
                          checked={
                            pagedRecords.length > 0 &&
                            pagedRecords.every((r) =>
                              selectedKeys.has(
                                rowKey(r.branchId, r.personnelId),
                              ),
                            )
                          }
                          onChange={handleToggleSelectAll}
                          className="checkbox-round cursor-pointer"
                          title="全选/取消全选（当前页）"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">人员</th>
                      <th className="px-4 py-3 font-medium">收光</th>
                      <th className="px-4 py-3 font-medium">麦序</th>
                      {qmInputEnabled && (
                        <th className="px-4 py-3 font-medium">全麦</th>
                      )}
                      {zcInputEnabled && (
                        <th className="px-4 py-3 font-medium">主持</th>
                      )}
                      {branchCycle === "MONTH" && (
                        <th className="px-4 py-3 font-medium">冠名</th>
                      )}
                      <th className="px-4 py-3 font-medium">福利</th>
                      <th className="px-4 py-3 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.length === 0 ? (
                      <tr>
                        <td
                          colSpan={
                            // 勾选框 + 人员 + 收光 + 麦序 + (全麦) + (主持) + (冠名) + 福利 + 操作
                            5 +
                            (qmInputEnabled ? 1 : 0) +
                            (zcInputEnabled ? 1 : 0) +
                            (branchCycle === "MONTH" ? 1 : 0)
                          }
                          className="px-4 py-12 text-center text-textMuted"
                        >
                          {!effectiveBranchId
                            ? "请选择厅后查看数据"
                            : searchTerm
                              ? "未找到匹配的人员"
                              : "暂无数据"}
                        </td>
                      </tr>
                    ) : (
                      pagedRecords.map((r) => (
                        <tr
                          key={r.key}
                          className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                            !r.isRecorded ? "opacity-60" : ""
                          } ${selectedKeys.has(rowKey(r.branchId, r.personnelId)) ? "bg-primary/5" : ""}`}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(
                                rowKey(r.branchId, r.personnelId),
                              )}
                              onChange={() =>
                                handleToggleSelect(r.branchId, r.personnelId)
                              }
                              className="checkbox-round cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-textPrimary">
                            <div className="flex items-center gap-2">
                              {r.personnelName}
                              {!r.isRecorded && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-textMuted/10 text-textMuted">
                                  未录入
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-textPrimary font-mono">
                            {r.isRecorded ? r.sg : "-"}
                          </td>
                          <td className="px-4 py-3 text-textPrimary font-mono">
                            {r.isRecorded ? r.mx : "-"}
                          </td>
                          {qmInputEnabled && (
                            <td className="px-4 py-3 text-textPrimary font-mono">
                              {r.isRecorded ? r.qm : "-"}
                            </td>
                          )}
                          {zcInputEnabled && (
                            <td className="px-4 py-3 text-textPrimary font-mono">
                              {r.isRecorded ? r.zcDays : "-"}
                            </td>
                          )}
                          {branchCycle === "MONTH" && (
                            <td className="px-4 py-3 text-textPrimary text-xs whitespace-nowrap">
                              {r.isRecorded ? formatNamings(r.namings) : "-"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-textPrimary font-mono">
                            {r.finalWelfare !== undefined
                              ? r.deduction
                                ? `${r.finalWelfare} (-${r.deduction})`
                                : r.finalWelfare
                              : (r.welfare ?? "-")}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.isRecorded ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() =>
                                    handleEdit({
                                      id: r.id,
                                      personnelId: r.personnelId,
                                      sg: r.sg,
                                      mx: r.mx,
                                      qm: r.qm,
                                      zcDays: r.zcDays,
                                      namings: r.namings,
                                    } as DataRecord)
                                  }
                                  className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                                  title="编辑"
                                >
                                  <Pencil size={16} />
                                </button>
                                {canDelete && (
                                  <button
                                    onClick={() => handleDelete(r.id)}
                                    className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                                    title="删除"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-textMuted text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* 分页控件：每页最多 30 人 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
                  <span className="text-textSecondary">
                    第 {safePage} / {totalPages} 页（共 {filteredRecords.length}{" "}
                    人）
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                      title="上一页"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-3 text-textPrimary font-mono">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={safePage >= totalPages}
                      className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                      title="下一页"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 导入弹窗 */}
      <Modal
        open={importOpen}
        title="导入数据"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <button
              onClick={() => setImportOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {importing && <Spinner className="h-4 w-4" />}
              {importing ? "导入中..." : "开始导入"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Tab 切换 */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setImportTab("excel")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
                importTab === "excel"
                  ? "border-primary text-primary"
                  : "border-transparent text-textSecondary hover:text-textPrimary"
              }`}
            >
              <FileSpreadsheet size={16} />
              Excel上传
            </button>
            <button
              onClick={() => setImportTab("paste")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
                importTab === "paste"
                  ? "border-primary text-primary"
                  : "border-transparent text-textSecondary hover:text-textPrimary"
              }`}
            >
              <ClipboardPaste size={16} />
              表格粘贴
            </button>
          </div>

          {/* 导入备注（共用，覆盖原有备注） */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              备注
              <span className="text-danger ml-0.5">*</span>
              <span className="ml-1 text-[10px] text-textMuted">（共用，覆盖原有备注）</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={importRemark}
              onChange={(e) => setImportRemark(e.target.value)}
              placeholder="必填，最多 100 字"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>

          {importTab === "excel" ? (
            <div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-textSecondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:text-sm file:font-medium hover:file:bg-primary-hover cursor-pointer"
              />
              {excelFile && (
                <p className="mt-2 text-xs text-textSecondary">
                  已选择：{excelFile.name}
                </p>
              )}
              <p className="mt-3 text-xs text-textMuted">
                Excel
                格式：第一列为姓名，第二列收光，第三列麦序，第四列全麦。第一行为表头将被跳过。数据列可留空（仅导入人员名单）。
              </p>
            </div>
          ) : (
            <div>
              <textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder={
                  "姓名\t收光\t麦序\t全麦\n张三\t10\t40\t5\n李四\t8\t35\t3"
                }
                rows={8}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 resize-y"
              />
              <p className="mt-2 text-xs text-textMuted">
                支持Tab分隔或逗号分隔，第一行若包含"姓名"将被视为表头跳过。
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* 编辑记录弹窗 */}
      <Modal
        open={editModalOpen}
        title="编辑数据"
        onClose={() => {
          setEditModalOpen(false);
          setEditingId(null);
        }}
        footer={
          <>
            <button
              onClick={() => {
                setEditModalOpen(false);
                setEditingId(null);
              }}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleEditSubmit}
              disabled={editSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {editSubmitting && <Spinner className="h-4 w-4" />}
              {editSubmitting ? "保存中..." : "保存"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 人员 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              人员
            </label>
            <SearchableSelect
              value={editForm.personnelId}
              onChange={(val) => setEditForm({ ...editForm, personnelId: val })}
              options={personnelOptions}
              placeholder="搜索人员姓名"
              emptyText="无匹配人员"
            />
          </div>
          {/* 收光 / 麦序 / 全麦 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                收光
                {!sgInputEnabled && (
                  <span className="ml-1 text-[10px] text-textMuted">
                    （已关闭）
                  </span>
                )}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={sgInputEnabled ? editForm.sg : ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, sg: e.target.value })
                }
                placeholder={sgInputEnabled ? "0" : "已关闭"}
                disabled={!sgInputEnabled}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                麦序
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={editForm.mx}
                onChange={(e) =>
                  setEditForm({ ...editForm, mx: e.target.value })
                }
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                全麦
                {!qmInputEnabled && (
                  <span className="ml-1 text-[10px] text-textMuted">
                    （已关闭）
                  </span>
                )}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={qmInputEnabled ? editForm.qm : ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, qm: e.target.value })
                }
                placeholder={qmInputEnabled ? "0" : "已关闭"}
                disabled={!qmInputEnabled}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* 主持天数：仅厅管理页开启主持福利时显示 */}
          {zcInputEnabled && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                主持天数
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={editForm.zcDays}
                onChange={(e) =>
                  setEditForm({ ...editForm, zcDays: e.target.value })
                }
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
          )}

          {/* 冠名数量：仅按月统计厅且已配置冠名等级时显示 */}
          {editNamingsEnabled && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-textSecondary">
                  冠名数量
                </label>
                <span className="text-[10px] text-textMuted">
                  阈值 = 该等级每达到一次需要的收光数
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {namingLevels.map((lv) => (
                  <div key={lv.id}>
                    <label className="block text-[11px] text-textSecondary mb-0.5">
                      {lv.name}
                      <span className="ml-1 text-textMuted">
                        （阈值{lv.threshold}）
                      </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editForm.namings[String(lv.id)] ?? ""}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          namings: {
                            ...editForm.namings,
                            [String(lv.id)]: e.target.value,
                          },
                        })
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-textMuted">
                提示：编辑冠名数量为覆盖模式，将直接保存为该记录当前的冠名总数。
              </p>
            </div>
          )}

          {/* 福利扣减：会长+超管+管理可编辑 */}
          {(isHuizhang || user?.role === "CHAOGUAN" || user?.role === "GUANLI") && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                福利扣减
                <span className="ml-1 text-[10px] text-textMuted">
                  （{branchCycle === "MONTH" ? "按月" : "按周"}扣减，最终福利 =
                  福利 - 扣减）
                </span>
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={editForm.deduction}
                onChange={(e) =>
                  setEditForm({ ...editForm, deduction: e.target.value })
                }
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
          )}

          {/* 操作备注：覆盖式存储到记录，显示在数据录入页搜索框后 */}
          <div className="sm:col-span-2">
            <label className="block text-xs text-textSecondary mb-1">
              备注
              <span className="text-danger ml-0.5">*</span>
              <span className="ml-1 text-[10px] text-textMuted">
                （将覆盖该记录原备注）
              </span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={editForm.remark}
              onChange={(e) =>
                setEditForm({ ...editForm, remark: e.target.value })
              }
              placeholder="必填，最多 100 字"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* 删除确认弹窗（含备注输入） */}
      <Modal
        open={deleteTargetId !== null}
        title="删除数据记录"
        onClose={() => {
          setDeleteTargetId(null);
          setDeleteRemark("");
        }}
        footer={
          <>
            <button
              onClick={() => {
                setDeleteTargetId(null);
                setDeleteRemark("");
              }}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors duration-200 cursor-pointer"
            >
              确认删除
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-textSecondary">
            确认删除该条数据记录？此操作不可撤销。
          </p>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              备注
              <span className="text-danger ml-0.5">*</span>
              <span className="ml-1 text-[10px] text-textMuted">（记录删除原因）</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={deleteRemark}
              onChange={(e) => setDeleteRemark(e.target.value)}
              placeholder="必填，最多 100 字"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDeleteConfirm();
              }}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* 批量编辑弹窗：每行独立编辑（按厅区分同一人员） */}
      <Modal
        open={batchEditOpen}
        title={`编辑（${selectedKeys.size} 项）`}
        onClose={() => setBatchEditOpen(false)}
        footer={
          <>
            <button
              onClick={() => setBatchEditOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleBatchSubmit}
              disabled={batchSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {batchSubmitting ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Save size={16} />
              )}
              {batchSubmitting ? "保存中..." : "批量保存"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-textMuted">
            每行可独立编辑收光/麦序/全麦，未录入的行填写后将自动创建记录。同一人员在多个厅的数据互不影响。
          </p>
          {/* 批量操作备注（共用） */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              备注
              <span className="text-danger ml-0.5">*</span>
              <span className="ml-1 text-[10px] text-textMuted">（共用，覆盖原有备注）</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={batchRemark}
              onChange={(e) => setBatchRemark(e.target.value)}
              placeholder="必填，最多 100 字"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin space-y-2">
            {allRows
              .filter((r) =>
                selectedKeys.has(rowKey(r.branchId, r.personnelId)),
              )
              .map((r) => {
                const k = rowKey(r.branchId, r.personnelId);
                return (
                  <div
                    key={k}
                    className={`p-3 border rounded-lg ${
                      r.isRecorded
                        ? "border-border bg-card"
                        : "border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-textPrimary">
                          {r.personnelName}
                        </span>
                        {!r.isRecorded && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            未录入
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-textMuted">
                        {r.branchName || "-"}
                      </span>
                    </div>
                    <div
                      className={`grid gap-2 ${zcInputEnabled ? "grid-cols-4" : "grid-cols-3"}`}
                    >
                      <div>
                        <label className="block text-[10px] text-textSecondary mb-0.5">
                          收光
                          {!sgInputEnabled && (
                            <span className="text-textMuted">（已关闭）</span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={
                            sgInputEnabled ? (batchForms[k]?.sg ?? "") : ""
                          }
                          onChange={(e) =>
                            handleBatchFieldChange(k, "sg", e.target.value)
                          }
                          placeholder={sgInputEnabled ? "0" : "已关闭"}
                          disabled={!sgInputEnabled}
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-textSecondary mb-0.5">
                          麦序
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={batchForms[k]?.mx ?? ""}
                          onChange={(e) =>
                            handleBatchFieldChange(k, "mx", e.target.value)
                          }
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-textSecondary mb-0.5">
                          全麦
                          {!qmInputEnabled && (
                            <span className="text-textMuted">（已关闭）</span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={
                            qmInputEnabled ? (batchForms[k]?.qm ?? "") : ""
                          }
                          onChange={(e) =>
                            handleBatchFieldChange(k, "qm", e.target.value)
                          }
                          placeholder={qmInputEnabled ? "0" : "已关闭"}
                          disabled={!qmInputEnabled}
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      {zcInputEnabled && (
                        <div>
                          <label className="block text-[10px] text-textSecondary mb-0.5">
                            主持天数
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={batchForms[k]?.zcDays ?? ""}
                            onChange={(e) =>
                              handleBatchFieldChange(k, "zcDays", e.target.value)
                            }
                            placeholder="0"
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </Modal>

      {/* 批量添加弹窗：表格化累加录入勾选行数据（按厅区分同一人员） */}
      <Modal
        open={batchAddOpen}
        title={`添加（${selectedKeys.size} 项）`}
        onClose={() => setBatchAddOpen(false)}
        footer={
          <>
            <button
              onClick={() => setBatchAddOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleBatchAddSubmit}
              disabled={batchAddSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {batchAddSubmitting ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Save size={16} />
              )}
              {batchAddSubmitting ? "保存中..." : "批量累加"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-textMuted">
            输入的数值会累加到已录入的数据上（原值 +
            输入值）。未录入的行将以此数值创建新记录。留空视为
            0（不累加）。同一人员在多个厅的数据互不影响。
          </p>
          {/* 批量添加备注（共用） */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              备注
              <span className="text-danger ml-0.5">*</span>
              <span className="ml-1 text-[10px] text-textMuted">（共用，覆盖原有备注）</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={batchRemark}
              onChange={(e) => setBatchRemark(e.target.value)}
              placeholder="必填，最多 100 字"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div className="max-h-[60vh] overflow-auto scrollbar-thin border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border sticky top-0 z-10">
                <tr className="text-left text-textSecondary">
                  <th className="px-3 py-2 font-medium">人员</th>
                  <th className="px-3 py-2 font-medium">厅</th>
                  <th className="px-3 py-2 font-medium text-center">收光</th>
                  <th className="px-3 py-2 font-medium text-center">麦序</th>
                  <th className="px-3 py-2 font-medium text-center">全麦</th>
                  {zcInputEnabled && (
                    <th className="px-3 py-2 font-medium text-center">主持天数</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {allRows
                  .filter((r) =>
                    selectedKeys.has(rowKey(r.branchId, r.personnelId)),
                  )
                  .map((r) => {
                    const k = rowKey(r.branchId, r.personnelId);
                    return (
                      <tr
                        key={k}
                        className={`border-b border-border last:border-0 ${
                          !r.isRecorded
                            ? "bg-amber-50/50 dark:bg-amber-900/10"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-textPrimary align-middle">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {r.personnelName}
                            </span>
                            {!r.isRecorded ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                未录入
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                已录入
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-textSecondary text-xs align-middle">
                          {r.branchName || "-"}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={
                              sgInputEnabled ? (batchAddForms[k]?.sg ?? "") : ""
                            }
                            onChange={(e) =>
                              handleBatchAddFieldChange(k, "sg", e.target.value)
                            }
                            placeholder={sgInputEnabled ? "0" : "已关闭"}
                            disabled={!sgInputEnabled}
                            className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={batchAddForms[k]?.mx ?? ""}
                            onChange={(e) =>
                              handleBatchAddFieldChange(k, "mx", e.target.value)
                            }
                            placeholder="0"
                            className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={
                              qmInputEnabled ? (batchAddForms[k]?.qm ?? "") : ""
                            }
                            onChange={(e) =>
                              handleBatchAddFieldChange(k, "qm", e.target.value)
                            }
                            placeholder={qmInputEnabled ? "0" : "已关闭"}
                            disabled={!qmInputEnabled}
                            className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        {zcInputEnabled && (
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={batchAddForms[k]?.zcDays ?? ""}
                              onChange={(e) =>
                                handleBatchAddFieldChange(k, "zcDays", e.target.value)
                              }
                              placeholder="0"
                              className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* 导出弹窗：可选按周/按月 + 历史周/月 */}
      <Modal
        open={exportOpen}
        title="导出数据"
        onClose={() => setExportOpen(false)}
        footer={
          <>
            <button
              onClick={() => setExportOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => handleExport("excel")}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {exporting === "excel" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Download size={16} />
              )}
              {exporting === "excel" ? "导出中..." : "导出 Excel"}
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {exporting === "csv" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Download size={16} />
              )}
              {exporting === "csv" ? "导出中..." : "导出 CSV"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 导出周期：只读显示，跟随厅配置 */}
          <div>
            <label className="block text-xs text-textSecondary mb-2">
              导出周期
            </label>
            <div className="inline-flex items-center px-3 py-2 rounded-lg bg-card border border-border text-sm text-textPrimary">
              {exportCycle === "MONTH" ? "按月统计" : "按周统计"}
            </div>
          </div>

          {/* 日期选择 */}
          <div>
            <label className="block text-xs text-textSecondary mb-2">
              {exportCycle === "MONTH" ? "选择月份" : "选择周次"}
            </label>
            {exportCycle === "MONTH" ? (
              <select
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                {exportMonths.map((m) => (
                  <option key={m.key} value={m.ref}>
                    {getMonthRangeText(m.ref)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                {exportWeeks.map((w) => (
                  <option key={w} value={w}>
                    {getWeekRangeText(w)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-textMuted">
            导出当前所选厅在该周期内的排名与福利数据。会长未选择厅时无法导出。
          </p>
        </div>
      </Modal>
    </div>
  );
}
