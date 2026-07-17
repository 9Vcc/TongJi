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
  // 每行的扣减金额输入：key -> 字符串（空表示清零）
  const [forms, setForms] = useState<Record<string, string>>({});
  // 共用备注（必填，覆盖式存储到扣减记录）
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开弹窗时初始化：预填当前扣减值，重置备注
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        const cur = r.deduction ?? 0;
        next[key] = cur ? String(cur) : "";
      }
    });
    setForms(next);
    setRemark("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFieldChange = (key: string, value: string) => {
    setForms((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const entries = Object.entries(forms);
    if (entries.length === 0) {
      toast.error("无数据可保存");
      return;
    }
    // 备注必填
    if (!remark.trim()) {
      toast.error("请填写备注");
      return;
    }
    // 解析并校验
    const parsed: Array<{
      key: string;
      branchId: number;
      personnelId: number;
      amount: number;
      cycle: "WEEK" | "MONTH";
      weekStartParam: string;
    }> = [];
    for (const [key, raw] of entries) {
      const [bidStr, pidStr] = key.split(":");
      const branchId = Number(bidStr);
      const personnelId = Number(pidStr);
      const amount = raw.trim() === "" ? 0 : Number(raw);
      if (!Number.isInteger(amount) || amount < 0) {
        toast.error("扣减金额必须为非负整数");
        return;
      }
      // 合厅组模式按各厅 statCycle 计算 cycle 和 weekStart
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

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const item of parsed) {
        try {
          if (item.amount === 0) {
            // 扣减为 0：删除该周期扣减记录（清零）
            await deductionsApi.remove({
              branchId: item.branchId,
              personnelId: item.personnelId,
              weekStart: item.weekStartParam,
              cycle: item.cycle,
            });
          } else {
            // 正值：upsert 覆盖旧值
            await deductionsApi.upsert({
              branchId: item.branchId,
              personnelId: item.personnelId,
              weekStart: item.weekStartParam,
              cycle: item.cycle,
              amount: item.amount,
              remark: remark.trim(),
            });
          }
          successCount++;
        } catch {
          failCount++;
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
        <p className="text-xs text-textMuted">
          {`输入扣减金额会覆盖原值（${cycleText}扣减，最终福利 = 福利 -
          扣减）。留空或填 0 表示清零（删除扣减记录）。`}
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

        <div className="max-h-[60vh] overflow-auto scrollbar-thin border border-border rounded-custom-sm">
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
                <th className="px-3 py-2.5 font-medium text-center w-32">
                  扣减金额
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
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={forms[k] ?? ""}
                          onChange={(e) => handleFieldChange(k, e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
