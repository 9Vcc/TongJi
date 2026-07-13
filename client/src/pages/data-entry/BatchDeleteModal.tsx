import { useState } from "react";
import { Trash2 } from "lucide-react";
import { dataRecordsApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import type { DisplayRow } from "./types";
import { rowKey } from "./types";

interface BatchDeleteModalProps {
  open: boolean;
  onClose: () => void;
  allRows: DisplayRow[];
  selectedKeys: Set<string>;
  // 共用备注（与批量编辑/添加共享）
  batchRemark: string;
  onBatchRemarkChange: (v: string) => void;
  onSaved: () => void | Promise<void>;
  // 清空选中行的回调
  onClearSelection: () => void;
}

export default function BatchDeleteModal({
  open,
  onClose,
  allRows,
  selectedKeys,
  batchRemark,
  onBatchRemarkChange,
  onSaved,
  onClearSelection,
}: BatchDeleteModalProps) {
  const toast = useToast();
  const [batchDeleteSubmitting, setBatchDeleteSubmitting] = useState(false);

  // 批量删除提交：仅删除已录入的记录，串行调用删除接口
  const handleBatchDeleteSubmit = async () => {
    // 备注必填
    if (!batchRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    // 收集已录入记录的 id
    const toDelete = allRows.filter(
      (r) =>
        selectedKeys.has(rowKey(r.branchId, r.personnelId)) &&
        r.isRecorded &&
        r.id > 0,
    );
    if (toDelete.length === 0) {
      toast.error("没有可删除的已录入记录");
      return;
    }
    setBatchDeleteSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const item of toDelete) {
        try {
          await dataRecordsApi.delete(item.id, batchRemark.trim());
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        toast.success(`成功删除 ${successCount} 条记录`);
      } else {
        toast.info(
          `删除完成：成功 ${successCount} 条，失败 ${failCount} 条`,
        );
      }
      onClose();
      onClearSelection();
      onBatchRemarkChange("");
      await onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBatchDeleteSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`删除（${selectedKeys.size} 项）`}
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
            onClick={handleBatchDeleteSubmit}
            disabled={batchDeleteSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {batchDeleteSubmitting ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Trash2 size={16} />
            )}
            {batchDeleteSubmitting ? "删除中..." : "确认删除"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-textSecondary">
          将删除选中项中已录入的数据记录（未录入的占位行不受影响）。此操作不可撤销。
        </p>
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            备注
            <span className="text-danger ml-0.5">*</span>
            <span className="ml-1 text-[10px] text-textMuted">（记录删除原因，共用）</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={batchRemark}
            onChange={(e) => onBatchRemarkChange(e.target.value)}
            placeholder="必填，最多 100 字"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
          />
        </div>
      </div>
    </Modal>
  );
}
