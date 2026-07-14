import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import JSZip from "jszip";
import {
  dataQueryApi,
  exportApi,
  getErrorMessage,
} from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import GroupedSelect from "../../components/GroupedSelect";
import {
  formatDate,
  getWeekStart,
  getWeekRangeText,
  getMonthRangeText,
  getMonthStart,
} from "../../utils";
import type { Branch, StatCycle } from "../../types";

// 合厅组模式下的成员厅信息
interface GroupBranchInfo {
  id: number;
  name: string;
  statCycle: StatCycle;
}

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  effectiveBranchId: number | undefined;
  branchCycle: StatCycle;
  branches: Branch[];
  isHuizhang: boolean;
  // 合厅组模式参数
  isGroupMode?: boolean;
  groupName?: string;
  groupBranches?: GroupBranchInfo[];
}

export default function ExportModal({
  open,
  onClose,
  effectiveBranchId,
  branchCycle,
  branches,
  isHuizhang,
  isGroupMode = false,
  groupName,
  groupBranches,
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
    // 合厅组模式：不依赖单厅 weekStart 列表，直接使用当前周期初始化默认日期
    if (isGroupMode) {
      setExportCycle(branchCycle);
      if (branchCycle === "MONTH") {
        const d = new Date();
        d.setDate(1);
        setExportDate(formatDate(d));
      } else {
        setExportDate(formatDate(getWeekStart()));
      }
      setExportWeeks([]);
      return;
    }
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

  // 文件名特殊字符处理：替换空格和文件系统不允许的字符
  const sanitizeFileName = (name: string): string => {
    return name.replace(/[\\/:*?"<>|\s]+/g, "_");
  };

  // 计算指定厅的导出 weekStart 参数（合厅组模式下按各厅 statCycle 推导）
  const getBranchExportDate = (branch: GroupBranchInfo): string => {
    if (branch.statCycle === "MONTH") {
      // 月统计厅：取 exportDate 所在月的月初1日
      return formatDate(getMonthStart(new Date(exportDate)));
    }
    // 周统计厅：直接使用 exportDate
    return exportDate;
  };

  // 单厅导出：按所选周期和日期导出 Excel/CSV（保持原有行为不变）
  const handleSingleExport = async (type: "excel" | "csv") => {
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

  // 合厅组导出：对每个成员厅分别调用导出接口，打包为 zip 下载
  // 单个厅导出失败不中断整体流程，跳过失败厅并最终汇总提示
  const handleGroupExport = async (type: "excel" | "csv") => {
    if (!groupBranches || groupBranches.length === 0) {
      toast.error("合厅组没有可导出的成员厅");
      return;
    }
    setExporting(type);
    try {
      const zip = new JSZip();
      const dateStr = exportDate;
      const fileExt = type === "excel" ? "xlsx" : "csv";
      let successCount = 0;
      const failedBranches: string[] = [];

      // 并行请求所有厅的导出文件，单个失败不影响整体
      const results = await Promise.allSettled(
        groupBranches.map((branch) => {
          const branchDate = getBranchExportDate(branch);
          return type === "excel"
            ? exportApi.exportExcel(branchDate, branch.id, branch.statCycle)
            : exportApi.exportCSV(branchDate, branch.id, branch.statCycle);
        }),
      );

      results.forEach((result, idx) => {
        const branch = groupBranches[idx];
        if (result.status === "fulfilled") {
          const prefix = branch.statCycle === "MONTH" ? "月排名" : "周排名";
          const safeName = sanitizeFileName(branch.name);
          zip.file(`${safeName}_${prefix}_${dateStr}.${fileExt}`, result.value);
          successCount++;
        } else {
          failedBranches.push(branch.name);
        }
      });

      if (successCount === 0) {
        toast.error("所有厅导出失败");
        return;
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      const safeGroupName = sanitizeFileName(groupName ?? "合厅组");
      a.download = `${safeGroupName}_导出_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (failedBranches.length > 0) {
        toast.success(
          `${successCount}个厅导出成功，${failedBranches.length}个失败：${failedBranches.join("、")}`,
        );
      } else {
        toast.success(`成功导出 ${successCount} 个厅的数据`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  // 导出入口：根据是否合厅组模式分发
  const handleExport = async (type: "excel" | "csv") => {
    if (isGroupMode) {
      await handleGroupExport(type);
    } else {
      await handleSingleExport(type);
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
            {exporting === "excel"
              ? "导出中..."
              : isGroupMode
                ? "导出 Excel (Zip)"
                : "导出 Excel"}
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
            {exporting === "csv"
              ? "导出中..."
              : isGroupMode
                ? "导出 CSV (Zip)"
                : "导出 CSV"}
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
            {isGroupMode
              ? `合厅组导出 - 各厅按各自统计周期${
                  branchCycle === "MONTH" ? "（当前按月导航）" : "（当前按周导航）"
                }`
              : exportCycle === "MONTH"
                ? "按月统计"
                : "按周统计"}
          </div>
        </div>

        {/* 日期选择 */}
        <div>
          <label className="block text-xs text-textSecondary mb-2">
            {exportCycle === "MONTH" ? "选择月份" : "选择周次"}
          </label>
          {isGroupMode ? (
            // 合厅组模式：使用原生日期输入，避免依赖单厅的历史周次列表
            <input
              type={exportCycle === "MONTH" ? "month" : "date"}
              value={
                exportCycle === "MONTH" ? exportDate.slice(0, 7) : exportDate
              }
              onChange={(e) => {
                const val = e.target.value;
                if (exportCycle === "MONTH") {
                  // 月份输入：转换为月初日期
                  const [y, m] = val.split("-").map(Number);
                  setExportDate(formatDate(new Date(y, m - 1, 1)));
                } else {
                  // 周输入：归一到周一
                  setExportDate(formatDate(getWeekStart(new Date(val))));
                }
              }}
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            />
          ) : exportCycle === "MONTH" ? (
            <GroupedSelect
              value={exportDate}
              onChange={(val) => setExportDate(val)}
              fullWidth
              options={exportMonths.map((m) => ({
                value: m.ref,
                label: getMonthRangeText(m.ref),
              }))}
            />
          ) : (
            <GroupedSelect
              value={exportDate}
              onChange={(val) => setExportDate(val)}
              fullWidth
              options={exportWeeks.map((w) => ({
                value: w,
                label: getWeekRangeText(w),
              }))}
            />
          )}
        </div>

        {/* 合厅组模式：展示成员厅列表 */}
        {isGroupMode && groupBranches && groupBranches.length > 0 && (
          <div>
            <label className="block text-xs text-textSecondary mb-2">
              将导出的成员厅（{groupBranches.length}个）
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-card">
              <ul className="divide-y divide-border">
                {groupBranches.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between px-3 py-1.5 text-xs"
                  >
                    <span className="text-textPrimary">{b.name}</span>
                    <span
                      className={
                        b.statCycle === "MONTH"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-textSecondary"
                      }
                    >
                      {b.statCycle === "MONTH" ? "按月统计" : "按周统计"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="text-xs text-textMuted">
          {isGroupMode
            ? `将对每个成员厅分别导出，打包为 zip 下载（文件名：${groupName ?? "合厅组"}_导出_${exportDate}.zip）。`
            : "导出当前所选厅在该周期内的排名与福利数据。会长未选择厅时无法导出。"}
        </p>
      </div>
    </Modal>
  );
}
