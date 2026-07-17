import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { deductionsApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import { formatDate } from "../../utils";
import type { StatCycle } from "../../types";
import type { DisplayRow } from "./types";
import { rowKey } from "./types";

interface DeductionModalProps {
  open: boolean;
  onClose: () => void;
  allRows: DisplayRow[];
  selectedKeys: Set<string>;
  weekStart: Date;
  branchCycle: StatCycle;
  // 合厅组模式：按各厅 statCycle 归一化 weekStart 和 cycle
  isGroupMode: boolean;
  getRecordWeekStart: (branchId?: number) => string;
  getBranchCycle: (branchId?: number) => StatCycle;
  onSaved: () => void | Promise<void>;
  onClearSelection: () => void;
}

type Mode = "accumulate" | "set";

export default function DeductionModal({
  open,
  onClose,
  allRows,
  selectedKeys,
  weekStart,
  branchCycle,
  isGroupMode,
  getRecordWeekStart,
  getBranchCycle,
  onSaved,
  onClearSelection,
}: DeductionModalProps) {
  const toast = useToast();
  // 模式：累加（输入增量）或覆盖（输入目标值，用于修改）
  const [mode, setMode] = useState<Mode>("accumulate");
  // 每行的扣减金额输入：key -> 字符串
  const [forms, setForms] = useState<Record<string, string>>({});
  // 累加模式下标记需要清零的人员 key 集合
  const [clearKeys, setClearKeys] = useState<Set<string>>(new Set());
  // 共用备注（必填，覆盖式存储到扣减记录）
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开弹窗时初始化，重置备注
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        // 累加模式留空（输入增量），覆盖模式预填当前值（便于修改）
        next[key] = mode === "set" ? String(r.deduction ?? 0) : "";
      }
    });
    setForms(next);
    setClearKeys(new Set());
    setRemark("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 切换模式时重新初始化输入框
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    const next: Record<string, string> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        next[key] = newMode === "set" ? String(r.deduction ?? 0) : "";
      }
    });
    setForms(next);
    setClearKeys(new Set());
  };

  const handleFieldChange = (key: string, value: string) => {
    setForms((prev) => ({ ...prev, [key]: value }));
  };

  const toggleClear = (key: string) => {
    setClearKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // 清零时清空该行的累加输入
        setForms((prevForms) => ({ ...prevForms, [key]: "" }));
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    const entries = Object.entries(forms);
    const hasClear = mode === "accumulate" && clearKeys.size > 0;

    // 过滤需要处理的人员
    let filled: Array<[string, string]> = [];
    if (mode === "set") {
      // 覆盖模式：处理所有选中人员（包括值为0的，用于清零）
      filled = entries;
    } else {
      // 累加模式：只处理有输入值的人员
      filled = entries.filter(([, raw]) => raw.trim() !== "");
    }

    if (filled.length === 0 && !hasClear) {
      toast.error("请输入扣减金额或勾选清零");
      return;
    }
    // 备注必填
    if (!remark.trim()) {
      toast.error("请填写备注");
      return;
    }

    // 解析输入项
    const parsed: Array<{
      key: string;
      branchId: number;
      personnelId: number;
      amount: number;
      cycle: "WEEK" | "MONTH";
      weekStartParam: string;
    }> = [];
    for (const [key, raw] of filled) {
      const [bidStr, pidStr] = key.split(":");
      const branchId = Number(bidStr);
      const personnelId = Number(pidStr);
      const amount = raw.trim() === "" ? 0 : Number(raw);
      if (!Number.isInteger(amount) || amount < 0) {
        toast.error("扣减金额必须为非负整数");
        return;
      }
      if (mode === "accumulate" && amount <= 0) {
        // 累加模式跳过空值（已在 filter 中过滤，此处防御）
        continue;
      }
      const cycle: "WEEK" | "MONTH" =
        (isGroupMode ? getBranchCycle(branchId) : branchCycle) === "MONTH"
          ? "MONTH"
          : "WEEK";
      const weekStartParam = isGroupMode
        ? getRecordWeekStart(branchId)
        : formatDate(
            branchCycle === "MONTH"
              ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
              : weekStart,
          );
      parsed.push({
        key,
        branchId,
        personnelId,
        amount,
        cycle,
        weekStartParam,
      });
    }

    // 累加模式下的清零项
    const clearParsed: Array<{
      branchId: number;
      personnelId: number;
      cycle: "WEEK" | "MONTH";
      weekStartParam: string;
    }> = [];
    if (mode === "accumulate") {
      for (const key of clearKeys) {
        const [bidStr, pidStr] = key.split(":");
        const branchId = Number(bidStr);
        const personnelId = Number(pidStr);
        const cycle: "WEEK" | "MONTH" =
          (isGroupMode ? getBranchCycle(branchId) : branchCycle) === "MONTH"
            ? "MONTH"
            : "WEEK";
        const weekStartParam = isGroupMode
          ? getRecordWeekStart(branchId)
          : formatDate(
              branchCycle === "MONTH"
                ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
                : weekStart,
            );
        clearParsed.push({ branchId, personnelId, cycle, weekStartParam });
      }
    }

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      // 累加模式：先处理清零
      if (mode === "accumulate") {
        for (const item of clearParsed) {
          try {
            await deductionsApi.remove({
              branchId: item.branchId,
              personnelId: item.personnelId,
              weekStart: item.weekStartParam,
              cycle: item.cycle,
            });
            successCount++;
          } catch {
            failCount++;
          }
        }
      }
      // 处理扣减（累加或覆盖）
      for (const item of parsed) {
        // 覆盖模式：值为0时用 remove 清零，否则用 upsert set
        // 累加模式：正值用 upsert accumulate
        if (mode === "set" && item.amount === 0) {
          try {
            await deductionsApi.remove({
              branchId: item.branchId,
              personnelId: item.personnelId,
              weekStart: item.weekStartParam,
              cycle: item.cycle,
            });
            successCount++;
          } catch {
            failCount++;
          }
        } else {
          try {
            await deductionsApi.upsert({
              branchId: item.branchId,
              personnelId: item.personnelId,
              weekStart: item.weekStartParam,
              cycle: item.cycle,
              amount: item.amount,
              remark: remark.trim(),
              mode,
            });
            successCount++;
          } catch {
            failCount++;
          }
        }
      }
      if (failCount === 0) {
        toast.success(`扣减保存成功，共 ${successCount} 条`);
      } else {
        toast.error(`部分失败：成功 ${successCount} 条，失败 ${failCount} 条`);
      }
      onClose();
      onClearSelection();
      await onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // 当前周期显示文本
  const cycleText = branchCycle === "MONTH" ? "按月" : "按周";

  return (
    <Modal
      open={open}
      title={`福利扣减（${selectedKeys.size} 人）`}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {submitting ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Save size={16} />
            )}
            {submitting ? "保存中..." : "保存扣减"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 模式切换 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleModeChange("accumulate")}
            className={`px-3 py-1.5 rounded-custom-sm text-xs font-medium transition-colors duration-200 cursor-pointer ${
              mode === "accumulate"
                ? "bg-primary text-white"
                : "bg-card text-textSecondary border border-border hover:text-textPrimary hover:border-primary"
            }`}
          >
            累加模式
          </button>
          <button
            onClick={() => handleModeChange("set")}
            className={`px-3 py-1.5 rounded-custom-sm text-xs font-medium transition-colors duration-200 cursor-pointer ${
              mode === "set"
                ? "bg-primary text-white"
                : "bg-card text-textSecondary border border-border hover:text-textPrimary hover:border-primary"
            }`}
          >
            覆盖模式
          </button>
          <span className="text-xs text-textMuted ml-1">
            {mode === "accumulate"
              ? "输入增量累加，留空跳过"
              : "直接设置目标值，0=清零"}
          </span>
        </div>

        <p className="text-xs text-textMuted">
          {mode === "accumulate"
            ? `输入扣减金额会累加到当前扣减上（${cycleText}扣减，最终福利 = 福利 - 扣减）。留空表示不调整。勾选"清零"可清除该人员扣减。`
            : `直接修改扣减总额（${cycleText}扣减，最终福利 = 福利 - 扣减）。输入0或清空表示清零该人员扣减。`}
        </p>

        <div>
          <label className="block text-xs text-textSecondary mb-1">
            备注 <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            maxLength={100}
            placeholder="必填"
            className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
          />
        </div>

        <div className="max-h-[55vh] overflow-auto scrollbar-thin border border-border rounded-custom-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border sticky top-0 z-10">
              <tr className="text-textSecondary">
                <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap min-w-[120px]">
                  人员
                </th>
                {isGroupMode && (
                  <th className="px-3 py-2.5 font-medium text-left whitespace-nowrap">
                    所属厅
                  </th>
                )}
                <th className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                  当前扣减
                </th>
                {mode === "accumulate" && (
                  <th className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                    清零
                  </th>
                )}
                <th className="px-3 py-2.5 font-medium text-center w-32">
                  {mode === "accumulate" ? "累加金额" : "扣减金额"}
                </th>
              </tr>
            </thead>
            <tbody>
              {allRows
                .filter((r) =>
                  selectedKeys.has(rowKey(r.branchId, r.personnelId)),
                )
                .map((r) => {
                  const k = rowKey(r.branchId, r.personnelId);
                  const isCleared = clearKeys.has(k);
                  return (
                    <tr
                      key={k}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-150"
                    >
                      <td className="px-4 py-2 text-textPrimary align-middle whitespace-nowrap">
                        <span className="font-medium">{r.personnelName}</span>
                      </td>
                      {isGroupMode && (
                        <td className="px-3 py-2 text-textSecondary align-middle whitespace-nowrap text-xs">
                          {r.branchName ?? "-"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center align-middle font-mono text-textSecondary">
                        {r.deduction ?? 0}
                      </td>
                      {mode === "accumulate" && (
                        <td className="px-3 py-2 text-center align-middle">
                          <input
                            type="checkbox"
                            checked={isCleared}
                            onChange={() => toggleClear(k)}
                            disabled={(r.deduction ?? 0) === 0}
                            className="checkbox-round"
                            title={
                              (r.deduction ?? 0) === 0
                                ? "无扣减，无需清零"
                                : "勾选后清零该人员扣减"
                            }
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="number"
                          min={mode === "accumulate" ? 1 : 0}
                          step={1}
                          value={forms[k] ?? ""}
                          onChange={(e) => handleFieldChange(k, e.target.value)}
                          disabled={mode === "accumulate" && isCleared}
                          placeholder={
                            mode === "accumulate"
                              ? isCleared
                                ? "已清零"
                                : "留空跳过"
                              : "0"
                          }
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
