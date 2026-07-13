import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  dataQueryApi,
  exportApi,
  getErrorMessage,
} from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import {
  formatDate,
  getWeekStart,
  getWeekRangeText,
  getMonthRangeText,
} from "../../utils";
import type { Branch, StatCycle } from "../../types";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  effectiveBranchId: number | undefined;
  branchCycle: StatCycle;
  branches: Branch[];
  isHuizhang: boolean;
}

export default function ExportModal({
  open,
  onClose,
  effectiveBranchId,
  branchCycle,
  branches,
  isHuizhang,
}: ExportModalProps) {
  const toast = useToast();
  const [exportCycle, setExportCycle] = useState<"WEEK" | "MONTH">("WEEK");
  const [exportWeeks, setExportWeeks] = useState<string[]>([]);
  const [exportDate, setExportDate] = useState<string>(
    formatDate(getWeekStart()),
  );
  const [exporting, setExporting] = useState<"excel" | "csv" | null>(null);

  // 打开弹窗：加载历史周次列表，默认选中当前周/月
  // 导出周期固定跟随当前厅的 statCycle，按周厅只能导出按周，按月厅只能导出按月
  useEffect(() => {
    if (!open) return;
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请先选择厅" : "当前账户未关联厅");
      onClose();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await dataQueryApi.getWeeks(effectiveBranchId);
        if (cancelled) return;
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
      } catch (err) {
        if (cancelled) return;
        toast.error(getErrorMessage(err));
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  return (
    <Modal
      open={open}
      title="导出数据"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
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
  );
}
