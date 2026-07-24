import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { noWelfareMarksApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import { formatDate } from "../../utils";
import type { StatCycle } from "../../types";
import type { DisplayRow } from "./types";
import { rowKey } from "./types";

interface NoWelfareModalProps {
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

export default function NoWelfareModal({
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
}: NoWelfareModalProps) {
  const toast = useToast();
  // 每行的勾选状态：key -> boolean（true=标记无福利，false=取消标记）
  const [markMap, setMarkMap] = useState<Record<string, boolean>>({});
  // 共用备注（标记时必填，覆盖式存储）
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开弹窗时初始化，根据当前标记状态预填勾选
  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        // 预填当前状态：已标记的勾选，未标记的不勾选
        next[key] = !!r.noWelfare;
      }
    });
    setMarkMap(next);
    setRemark("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleToggle = (key: string) => {
    setMarkMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    // 备注必填（标记操作需要记录原因）
    if (!remark.trim()) {
      toast.error("请填写备注");
      return;
    }

    // 区分需要标记和取消标记的人员
    const toMark: Array<{
      key: string;
      branchId: number;
      personnelId: number;
      cycle: "WEEK" | "MONTH";
      weekStartParam: string;
    }> = [];
    const toUnmark: Array<{
      key: string;
      branchId: number;
      personnelId: number;
      cycle: "WEEK" | "MONTH";
      weekStartParam: string;
    }> = [];

    for (const [key, shouldMark] of Object.entries(markMap)) {
      const [bidStr, pidStr] = key.split(":");
      const branchId = Number(bidStr);
      const personnelId = Number(pidStr);
      // 找到对应行获取原始状态
      const row = allRows.find(
        (r) => rowKey(r.branchId, r.personnelId) === key,
      );
      const wasMarked = !!row?.noWelfare;
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

      if (shouldMark && !wasMarked) {
        // 原未标记，现在要标记
        toMark.push({ key, branchId, personnelId, cycle, weekStartParam });
      } else if (!shouldMark && wasMarked) {
        // 原已标记，现在要取消
        toUnmark.push({ key, branchId, personnelId, cycle, weekStartParam });
      }
    }

    if (toMark.length === 0 && toUnmark.length === 0) {
      toast.error("请勾选需要变更标记的人员");
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      // 处理标记
      for (const item of toMark) {
        try {
          await noWelfareMarksApi.mark({
            branchId: item.branchId,
            personnelId: item.personnelId,
            weekStart: item.weekStartParam,
            cycle: item.cycle,
            remark: remark.trim(),
          });
          successCount++;
        } catch {
          failCount++;
        }
      }
      // 处理取消标记
      for (const item of toUnmark) {
        try {
          await noWelfareMarksApi.unmark({
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
      if (failCount === 0) {
        toast.success(`无福利标记保存成功，共 ${successCount} 条`);
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
      title={`无福利标记（${selectedKeys.size} 人）`}
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
              <Ban size={16} />
            )}
            {submitting ? "保存中..." : "保存标记"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-textMuted">
          {`勾选"标记无福利"后，该人员${cycleText}所有福利（基础福利、排名奖励、冠名福利）清零，扣减仍生效，最终福利 = max(0, 0 - 扣减) = 0。取消勾选可恢复福利计算。`}
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
            placeholder="必填，请填写标记原因"
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
                  当前状态
                </th>
                <th className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                  标记无福利
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
                  const isMarked = !!markMap[k];
                  const wasMarked = !!r.noWelfare;
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
                      <td className="px-3 py-2 text-center align-middle">
                        {wasMarked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-danger/10 text-danger">
                            已标记
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-textMuted/10 text-textMuted">
                            正常
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={isMarked}
                          onChange={() => handleToggle(k)}
                          className="checkbox-round cursor-pointer"
                          title={
                            isMarked
                              ? "取消标记（恢复福利计算）"
                              : "标记无福利（福利清零）"
                          }
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
