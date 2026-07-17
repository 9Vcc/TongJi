import { useEffect, useMemo, useState } from "react";
import {
  Upload,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  UserPlus,
  Trash2,
  Search,
  X,
  Layers,
  AlertTriangle,
  MinusCircle,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useDataEntryData } from "../hooks/useDataEntryData";
import {
  formatDate,
  getWeekRangeText,
  getMonthRangeText,
  matchNamePinyin,
} from "../utils";
import ImportModal from "./data-entry/ImportModal";
import EditRecordModal from "./data-entry/EditRecordModal";
import DeleteConfirmModal from "./data-entry/DeleteConfirmModal";
import BatchEditModal from "./data-entry/BatchEditModal";
import BatchAddModal from "./data-entry/BatchAddModal";
import BatchDeleteModal from "./data-entry/BatchDeleteModal";
import DeductionModal from "./data-entry/DeductionModal";
import ExportModal from "./data-entry/ExportModal";
import DataTable from "./data-entry/DataTable";
import GroupedSelect from "../components/GroupedSelect";
import type { DisplayRow, EditableRecord } from "./data-entry/types";
import { rowKey } from "./data-entry/types";

// 时间段标签生成（0-2、2-4、...、22-24）
const slotLabel = (idx: number) => `${idx * 2}-${idx * 2 + 2}`;
// 将 YYYY-MM-DD 格式化为「X月X日」
const formatMonthDay = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export default function DataEntry() {
  const { user } = useAuth();
  const toast = useToast();
  const isHuizhang = user?.role === "HUIZHANG";
  const isChaoguan = user?.role === "CHAOGUAN";
  const canSelectBranch = isHuizhang || isChaoguan;
  const canDelete = isHuizhang || isChaoguan;
  const canEditDeduction =
    isHuizhang || user?.role === "CHAOGUAN" || user?.role === "GUANLI";

  // 数据加载与厅配置逻辑抽取到 hook
  const {
    records,
    latestRemark,
    latestSlot,
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
    mxSlotEnabled,
    namingLevels,
    editNamingsEnabled,
    loadData,
  } = useDataEntryData({ isHuizhang, isChaoguan, user });

  // 合并同名开关：仅合厅组模式下生效，默认关闭
  const [mergeSameName, setMergeSameName] = useState(false);
  // 合厅组模式下选中的成员厅 ID 集合（用于前端过滤人员所属厅）
  const groupBranchIdSet = useMemo(
    () => new Set(effectiveBranchIds),
    [effectiveBranchIds],
  );
  // 当前选中的合厅组信息（用于导出弹窗展示和 zip 打包）
  const groupExportInfo = useMemo(() => {
    if (!isGroupMode || selectedGroupId === undefined) return null;
    const group = branchGroups.find((g) => g.id === selectedGroupId);
    if (!group) return null;
    return {
      name: group.name,
      branches: group.branches
        .filter((b) => !b.closed)
        .map((b) => ({
          id: b.id,
          name: b.name,
          statCycle: b.statCycle,
        })),
    };
  }, [isGroupMode, selectedGroupId, branchGroups]);
  // 当前是否有录入目标（单厅已选 或 合厅组模式）
  const hasTarget = isGroupMode || effectiveBranchId !== undefined;

  // 人员搜索框（用于过滤列表，替代原手动录入卡片的人员选择）
  const [searchTerm, setSearchTerm] = useState("");
  // 列表排序：null=按录入顺序，'sg'/'mx'/'qm'/'welfare'=按对应指标降序
  const [sortKey, setSortKey] = useState<"sg" | "mx" | "qm" | "welfare" | null>(
    null,
  );
  // 分页：每页最多 30 人
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // 弹窗 open 状态
  const [importOpen, setImportOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditableRecord | null>(
    null,
  );
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchAddOpen, setBatchAddOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // 批量编辑/添加/删除的共用备注（多个弹窗共享，由父组件管理）
  const [batchRemark, setBatchRemark] = useState("");

  // 多选：选中行标识：用 `${branchId}:${personnelId}` 区分多厅下的同一人员
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 编辑弹窗人员下拉选项（由当前厅人员列表派生）
  // 合厅组模式下，人员名后追加所属厅名以便区分
  const personnelOptions = useMemo(
    () =>
      personnel.map((p) => {
        if (isGroupMode) {
          const branchNames = (p.branches ?? [])
            .filter((b) => groupBranchIdSet.has(b.id))
            .map((b) => b.name)
            .join("/");
          return {
            value: String(p.id),
            label: branchNames ? `${p.name} [${branchNames}]` : p.name,
          };
        }
        return { value: String(p.id), label: p.name };
      }),
    [personnel, isGroupMode, groupBranchIdSet],
  );

  // 多选：切换某行选中状态
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
  const allRows = useMemo<DisplayRow[]>(() => {
    // 合厅组模式：按人员 + 各成员厅分别构造行（合并同名时聚合）
    if (isGroupMode) {
      // 合厅组成员厅的名称映射
      const branchNameMap = new Map<number, string>();
      const groupBranches =
        branchGroups
          .find((g) => g.id === selectedGroupId)
          ?.branches.filter((b) => !b.closed) ?? [];
      for (const b of groupBranches) branchNameMap.set(b.id, b.name);

      // 合并同名模式：按人员姓名聚合，累加各厅数据
      if (mergeSameName) {
        const byName = new Map<
          string,
          {
            personnelIds: number[];
            branchIds: number[];
            sg: number;
            mx: number;
            qm: number;
            zcDays: number;
            welfare: number;
            deduction: number;
            finalWelfare: number;
            isRecorded: boolean;
          }
        >();
        for (const p of personnel) {
          const personGroupBranches = (p.branches ?? []).filter((b) =>
            groupBranchIdSet.has(b.id),
          );
          const personRecords = records.filter(
            (r) =>
              r.personnelId === p.id && groupBranchIdSet.has(r.branchId),
          );
          const isRecorded = personRecords.length > 0;
          const entry =
            byName.get(p.name) ??
            {
              personnelIds: [],
              branchIds: personGroupBranches.map((b) => b.id),
              sg: 0, mx: 0, qm: 0, zcDays: 0,
              welfare: 0, deduction: 0, finalWelfare: 0,
              isRecorded: false,
            };
          entry.personnelIds.push(p.id);
          entry.isRecorded = entry.isRecorded || isRecorded;
          for (const r of personRecords) {
            entry.sg += r.sg;
            entry.mx += r.mx;
            entry.qm += r.qm;
            entry.zcDays += r.zcDays ?? 0;
            entry.welfare += r.welfare ?? 0;
            entry.deduction += r.deduction ?? 0;
            entry.finalWelfare += r.finalWelfare ?? r.welfare ?? 0;
          }
          byName.set(p.name, entry);
        }
        let rows: DisplayRow[] = Array.from(byName.entries()).map(
          ([name, e]) => ({
            key: `merge-${name}`,
            id: 0,
            personnelId: e.personnelIds[0] ?? 0,
            branchId: undefined,
            personnelName: name,
            branchName: e.branchIds
              .map((bid) => branchNameMap.get(bid) ?? "")
              .filter(Boolean)
              .join("/"),
            sg: e.sg,
            mx: e.mx,
            qm: e.qm,
            zcDays: e.zcDays,
            welfare: e.welfare,
            deduction: e.deduction,
            finalWelfare: e.finalWelfare,
            isRecorded: e.isRecorded,
            namings: undefined,
          }),
        );
        if (sortKey) {
          rows = [...rows].sort((a, b) => {
            const av =
              sortKey === "welfare"
                ? (a.finalWelfare ?? a.welfare ?? 0)
                : a[sortKey];
            const bv =
              sortKey === "welfare"
                ? (b.finalWelfare ?? b.welfare ?? 0)
                : b[sortKey];
            return bv - av;
          });
        }
        return rows;
      }

      // 非合并模式：按人员 + 厅分别显示
      const recordedKeys = new Set(
        records.map((r) => `${r.branchId}:${r.personnelId}`),
      );
      const rows: DisplayRow[] = [];
      for (const p of personnel) {
        const personGroupBranches = (p.branches ?? []).filter((b) =>
          groupBranchIdSet.has(b.id),
        );
        for (const b of personGroupBranches) {
          const rec = records.find(
            (r) => r.personnelId === p.id && r.branchId === b.id,
          );
          if (rec) {
            rows.push({
              key: `rec-${rec.id}`,
              id: rec.id,
              personnelId: p.id,
              branchId: b.id,
              personnelName: p.name,
              branchName: b.name,
              sg: rec.sg,
              mx: rec.mx,
              qm: rec.qm,
              zcDays: rec.zcDays ?? 0,
              welfare: rec.welfare,
              deduction: rec.deduction,
              finalWelfare: rec.finalWelfare,
              createdAt: rec.createdAt,
              isRecorded: true,
              namings: rec.namings,
            });
          } else {
            rows.push({
              key: `empty-${p.id}-${b.id}`,
              id: 0,
              personnelId: p.id,
              branchId: b.id,
              personnelName: p.name,
              branchName: b.name,
              sg: 0,
              mx: 0,
              qm: 0,
              zcDays: 0,
              welfare: undefined,
              createdAt: undefined,
              isRecorded: false,
              namings: undefined,
            });
          }
        }
      }
      // 已录入按 sortKey 排序，未录入保持原序
      if (sortKey) {
        rows.sort((a, b) => {
          const av =
            sortKey === "welfare"
              ? (a.finalWelfare ?? a.welfare ?? 0)
              : a[sortKey];
          const bv =
            sortKey === "welfare"
              ? (b.finalWelfare ?? b.welfare ?? 0)
              : b[sortKey];
          return bv - av;
        });
      }
      // 未引用 recordedKeys（构造时已直接判断），避免 lint 警告
      void recordedKeys;
      return rows;
    }

    // 单厅模式：原有逻辑
    // 已录入的人员标识集合：用 `${branchId}:${personnelId}` 区分多厅
    const recordedKeys = new Set(
      records.map((r) => `${r.branchId}:${r.personnelId}`),
    );
    // 未录入：单厅模式匹配该厅
    const unrecorded = personnel.filter((p) => {
      if (effectiveBranchId) {
        return !recordedKeys.has(`${effectiveBranchId}:${p.id}`);
      }
      return !records.some((r) => r.personnelId === p.id);
    });
    // 已录入记录按 sortKey 降序排序
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
  }, [
    records,
    personnel,
    effectiveBranchId,
    sortKey,
    isGroupMode,
    mergeSameName,
    groupBranchIdSet,
    branchGroups,
    selectedGroupId,
  ]);

  // 受搜索框过滤的行
  const filteredRecords = useMemo<DisplayRow[]>(() => {
    const term = searchTerm.trim();
    if (!term) return allRows;
    return allRows.filter((r) => matchNamePinyin(r.personnelName, term));
  }, [allRows, searchTerm]);

  // 全选/取消全选（仅当前可见行）
  const handleToggleSelectAll = () => {
    setSelectedKeys((prev) => {
      const visibleKeys = pagedRecords.map((r) =>
        rowKey(r.branchId, r.personnelId),
      );
      if (visibleKeys.every((k) => prev.has(k))) {
        const next = new Set(prev);
        visibleKeys.forEach((k) => next.delete(k));
        return next;
      }
      const next = new Set(prev);
      visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  // 分页切片
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRecords = useMemo(
    () => filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRecords, safePage],
  );
  // 搜索或切换厅/合厅组时重置到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, effectiveBranchId, selectedGroupId, mergeSameName]);

  // 打开批量编辑弹窗
  const handleOpenBatchEdit = () => {
    if (selectedKeys.size === 0) {
      toast.error("请先勾选要批量编辑的人员");
      return;
    }
    setBatchEditOpen(true);
  };

  // 打开批量添加弹窗
  const handleOpenBatchAdd = () => {
    if (!hasTarget) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    if (selectedKeys.size === 0) {
      toast.error("请先勾选要批量添加的人员");
      return;
    }
    setBatchAddOpen(true);
  };

  // 打开扣减弹窗（会长/超管/管理可编辑扣减）
  const handleOpenDeduction = () => {
    if (!hasTarget) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    if (selectedKeys.size === 0) {
      toast.error("请先勾选要设置扣减的人员");
      return;
    }
    setDeductionOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 未选厅/合厅组时仅显示厅选择器，不显示日期控件 */}
        {hasTarget ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrev}
              className="p-2 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-4 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary min-w-[220px] text-center">
              {isMonthCycle
                ? getMonthRangeText(weekStart)
                : getWeekRangeText(weekStart)}
            </div>
            <button
              onClick={handleNext}
              className="p-2 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={handleThisPeriod}
              className="px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              {isMonthCycle ? "本月" : "本周"}
            </button>
            {/* 厅配置统计周期标签 */}
            {branchCycle === "MONTH" && (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning"
                title="该厅配置为按月统计"
              >
                月统计厅
              </span>
            )}
            {/* 合厅组模式：合并同名开关 */}
            {isGroupMode && (
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-custom-sm bg-card text-xs text-textSecondary cursor-pointer select-none"
                title="开启后同名人员合并为一行，数据按各厅累加"
              >
                <input
                  type="checkbox"
                  checked={mergeSameName}
                  onChange={(e) => setMergeSameName(e.target.checked)}
                  className="checkbox-round cursor-pointer"
                />
                合并同名
              </label>
            )}
            {/* 混合周期提示 */}
            {isMixedCycle && (
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                title="合厅组内各厅统计周期不一致"
              >
                <AlertTriangle size={12} />
                周期混合
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm text-textMuted">请先选择厅</div>
        )}

        <div className="flex items-center gap-2">
          {canSelectBranch && (
            <GroupedSelect
              value={
                selectedGroupId !== undefined
                  ? `g${selectedGroupId}`
                  : (branchId !== undefined
                    ? String(branchId)
                    : (isChaoguan ? String(user?.branchId ?? "") : ""))
              }
              onChange={(val) => {
                if (val.startsWith("g")) {
                  // 选择合厅组：清空厅选择，设置合厅组 ID
                  setSelectedGroupId(Number(val.slice(1)));
                  setBranchId(undefined);
                } else {
                  // 选择普通厅：清空合厅组选择
                  setSelectedGroupId(undefined);
                  setBranchId(val ? Number(val) : undefined);
                }
              }}
              placeholder="选择厅"
              topOption={isHuizhang ? { value: "", label: "选择厅" } : undefined}
              groups={[
                // 合厅组分组：隐藏已被合并到合厅组的厅
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
                  options: branches
                    .filter(
                      (b) =>
                        !b.closed &&
                        !branchGroups.some((g) =>
                          g.branches.some((gb) => gb.id === b.id),
                        ),
                    )
                    .map((b) => ({
                      value: String(b.id),
                      label: b.name,
                    })),
                },
              ]}
              minWidth={200}
              maxWidth={300}
            />
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={handleOpenBatchEdit}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <CheckSquare size={16} />
              编辑（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={handleOpenBatchAdd}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <UserPlus size={16} />
              添加（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && canEditDeduction && (
            <button
              onClick={handleOpenDeduction}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary hover:border-primary hover:text-textPrimary transition-colors duration-200 cursor-pointer"
            >
              <MinusCircle size={16} />
              扣减（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && canDelete && (
            <button
              onClick={() => setBatchDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-custom-sm text-sm font-medium hover:bg-red-600 transition-colors duration-200 cursor-pointer"
            >
              <Trash2 size={16} />
              删除（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={() => setSelectedKeys(new Set())}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textSecondary hover:border-danger hover:text-danger transition-colors duration-200 cursor-pointer"
              title="取消所有选择"
            >
              <X size={16} />
              取消选择
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            disabled={!hasTarget || isGroupMode}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary hover:border-primary hover:text-textPrimary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            title={
              isGroupMode
                ? "合厅模式下暂不支持导入"
                : !hasTarget
                  ? "请先选择厅"
                  : undefined
            }
          >
            <Upload size={16} />
            导入
          </button>
          {canDelete && (
            <button
              onClick={() => setExportOpen(true)}
              disabled={!hasTarget}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              title={!hasTarget ? "请先选择厅" : undefined}
            >
              <Download size={16} />
              导出
            </button>
          )}
        </div>
      </div>
      {/* 合厅模式下导入禁用提示 */}
      {isGroupMode && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 rounded-custom-sm text-xs text-amber-700 dark:text-amber-300">
          <Layers size={12} />
          合厅模式下暂不支持导入，请切换到单个厅进行操作；导出将分别导出各成员厅并打包为 zip
        </div>
      )}

      {/* 人员搜索框 */}
      <div className="art-card p-3">
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
              className="w-full pl-9 pr-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          {/* 最近备注 + 最近录入时段：合并显示在同一块中 */}
          {(latestRemark || (latestSlot.slotDate && latestSlot.slotIndex !== null)) && (
            <div
              className="flex items-center gap-3 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-custom-sm text-xs text-primary max-w-2xl"
              title={
                [
                  latestRemark ? `最近备注：${latestRemark}` : '',
                  latestSlot.slotDate && latestSlot.slotIndex !== null
                    ? `最近录入：${formatMonthDay(latestSlot.slotDate)} ${slotLabel(latestSlot.slotIndex)}`
                    : '',
                ].filter(Boolean).join(' ｜ ')
              }
            >
              {latestRemark && (
                <span className="flex items-center gap-1.5 truncate">
                  <span className="text-textMuted shrink-0">最近备注：</span>
                  <span className="truncate">{latestRemark}</span>
                </span>
              )}
              {latestSlot.slotDate && latestSlot.slotIndex !== null && (
                <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <span className="text-textMuted">最近录入：</span>
                  <span>
                    {formatMonthDay(latestSlot.slotDate)} {slotLabel(latestSlot.slotIndex)}
                  </span>
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-textSecondary">排序</span>
            <GroupedSelect
              value={sortKey ?? ""}
              onChange={(val) =>
                setSortKey(
                  (val || null) as
                    "sg" | "mx" | "qm" | "welfare" | null,
                )
              }
              buttonClassName="!px-2 !py-1.5 !text-xs"
              topOption={{ value: "", label: "默认" }}
              options={[
                { value: "mx", label: "麦序" },
                { value: "sg", label: "收光" },
                ...(qmInputEnabled ? [{ value: "qm", label: "全麦" }] : []),
                { value: "welfare", label: "福利" },
              ]}
            />
          </div>
          <span className="text-xs text-textSecondary ml-auto">
            共 {filteredRecords.length} 人
          </span>
        </div>
      </div>

      {/* 录入明细表格 */}
      <DataTable
        animationKey={`${formatDate(weekStart)}-${effectiveBranchId ?? "all"}-${selectedGroupId ?? ""}`}
        loading={loading}
        hasRecords={records.length > 0}
        effectiveBranchId={effectiveBranchId}
        isGroupMode={isGroupMode}
        mergeSameName={mergeSameName}
        searchTerm={searchTerm}
        pagedRecords={pagedRecords}
        filteredCount={filteredRecords.length}
        selectedKeys={selectedKeys}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        onEdit={(record) => setEditingRecord(record)}
        onDelete={(id) => setDeleteTargetId(id)}
        canDelete={canDelete}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        branchCycle={branchCycle}
        safePage={safePage}
        totalPages={totalPages}
        onSetPage={setCurrentPage}
      />

      {/* 各弹窗 */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        effectiveBranchId={effectiveBranchId}
        recordWeekStart={recordWeekStart}
        isHuizhang={isHuizhang}
        onImported={loadData}
      />
      <EditRecordModal
        open={editingRecord !== null}
        onClose={() => setEditingRecord(null)}
        record={editingRecord}
        branchCycle={branchCycle}
        namingLevels={namingLevels}
        personnelOptions={personnelOptions}
        records={records}
        sgInputEnabled={sgInputEnabled}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        editNamingsEnabled={editNamingsEnabled}
        isGroupMode={isGroupMode}
        getBranchCycle={getBranchCycle}
        getNamingLevels={getNamingLevels}
        getRewardRule={getRewardRule}
        onSaved={loadData}
      />
      <DeleteConfirmModal
        open={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        targetId={deleteTargetId}
        onDeleted={loadData}
      />
      <BatchEditModal
        open={batchEditOpen}
        onClose={() => setBatchEditOpen(false)}
        allRows={allRows}
        selectedKeys={selectedKeys}
        recordWeekStart={recordWeekStart}
        getRecordWeekStart={getRecordWeekStart}
        sgInputEnabled={sgInputEnabled}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        isHuizhang={isHuizhang}
        isGroupMode={isGroupMode}
        hasTarget={hasTarget}
        batchRemark={batchRemark}
        onBatchRemarkChange={setBatchRemark}
        onSaved={loadData}
        onClearSelection={() => setSelectedKeys(new Set())}
      />
      <BatchAddModal
        open={batchAddOpen}
        onClose={() => setBatchAddOpen(false)}
        allRows={allRows}
        selectedKeys={selectedKeys}
        recordWeekStart={recordWeekStart}
        getRecordWeekStart={getRecordWeekStart}
        sgInputEnabled={sgInputEnabled}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        mxSlotEnabled={mxSlotEnabled}
        effectiveBranchId={effectiveBranchId}
        effectiveBranchIds={effectiveBranchIds}
        isHuizhang={isHuizhang}
        isGroupMode={isGroupMode}
        hasTarget={hasTarget}
        batchRemark={batchRemark}
        onBatchRemarkChange={setBatchRemark}
        onSaved={loadData}
        onClearSelection={() => setSelectedKeys(new Set())}
      />
      <BatchDeleteModal
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        allRows={allRows}
        selectedKeys={selectedKeys}
        batchRemark={batchRemark}
        onBatchRemarkChange={setBatchRemark}
        onSaved={loadData}
        onClearSelection={() => setSelectedKeys(new Set())}
      />
      <DeductionModal
        open={deductionOpen}
        onClose={() => setDeductionOpen(false)}
        allRows={allRows}
        selectedKeys={selectedKeys}
        weekStart={weekStart}
        branchCycle={branchCycle}
        isGroupMode={isGroupMode}
        getRecordWeekStart={getRecordWeekStart}
        getBranchCycle={getBranchCycle}
        onSaved={loadData}
        onClearSelection={() => setSelectedKeys(new Set())}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        effectiveBranchId={effectiveBranchId}
        branchCycle={branchCycle}
        branches={branches}
        isHuizhang={isHuizhang}
        isGroupMode={isGroupMode}
        groupName={groupExportInfo?.name}
        groupBranches={groupExportInfo?.branches}
        currentWeekStart={weekStart}
      />
    </div>
  );
}
