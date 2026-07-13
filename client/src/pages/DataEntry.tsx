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
import ExportModal from "./data-entry/ExportModal";
import DataTable from "./data-entry/DataTable";
import type { DisplayRow, EditableRecord } from "./data-entry/types";
import { rowKey } from "./data-entry/types";

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
  } = useDataEntryData({ isHuizhang, isChaoguan, user });

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
  const [exportOpen, setExportOpen] = useState(false);

  // 批量编辑/添加/删除的共用备注（多个弹窗共享，由父组件管理）
  const [batchRemark, setBatchRemark] = useState("");

  // 多选：选中行标识：用 `${branchId}:${personnelId}` 区分多厅下的同一人员
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 编辑弹窗人员下拉选项（由当前厅人员列表派生）
  const personnelOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [personnel],
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
  }, [records, personnel, effectiveBranchId, sortKey]);

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
  // 搜索或切换厅时重置到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, effectiveBranchId]);

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
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    if (selectedKeys.size === 0) {
      toast.error("请先勾选要批量添加的人员");
      return;
    }
    setBatchAddOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 未选厅时仅显示厅选择器，不显示日期控件 */}
        {effectiveBranchId ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
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
              onClick={handleNext}
              className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={handleThisPeriod}
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
          {canSelectBranch && (
            <select
              value={branchId ?? (isChaoguan ? user?.branchId ?? "" : "")}
              onChange={(e) =>
                setBranchId(e.target.value ? Number(e.target.value) : undefined)
              }
              className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            >
              {isHuizhang && <option value="">选择厅</option>}
              {branches.filter((b) => !b.closed).map((b) => (
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
          {selectedKeys.size > 0 && canDelete && (
            <button
              onClick={() => setBatchDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors duration-200 cursor-pointer"
            >
              <Trash2 size={16} />
              删除（{selectedKeys.size}）
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
              onClick={() => setExportOpen(true)}
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

      {/* 人员搜索框 */}
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

      {/* 录入明细表格 */}
      <DataTable
        animationKey={`${formatDate(weekStart)}-${effectiveBranchId ?? "all"}`}
        loading={loading}
        hasRecords={records.length > 0}
        effectiveBranchId={effectiveBranchId}
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
        effectiveBranchId={effectiveBranchId}
        weekStart={weekStart}
        branchCycle={branchCycle}
        namingLevels={namingLevels}
        personnelOptions={personnelOptions}
        records={records}
        sgInputEnabled={sgInputEnabled}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        editNamingsEnabled={editNamingsEnabled}
        canEditDeduction={canEditDeduction}
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
        effectiveBranchId={effectiveBranchId}
        recordWeekStart={recordWeekStart}
        sgInputEnabled={sgInputEnabled}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        isHuizhang={isHuizhang}
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
        effectiveBranchId={effectiveBranchId}
        recordWeekStart={recordWeekStart}
        sgInputEnabled={sgInputEnabled}
        qmInputEnabled={qmInputEnabled}
        zcInputEnabled={zcInputEnabled}
        isHuizhang={isHuizhang}
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
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        effectiveBranchId={effectiveBranchId}
        branchCycle={branchCycle}
        branches={branches}
        isHuizhang={isHuizhang}
      />
    </div>
  );
}
