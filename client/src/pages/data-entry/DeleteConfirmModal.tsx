import { useEffect, useState } from "react";
import { dataRecordsApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  // 要删除的记录 ID（null 时不显示）
  targetId: number | null;
  onDeleted: () => void | Promise<void>;
}

export default function DeleteConfirmModal({
  open,
  onClose,
  targetId,
  onDeleted,
}: DeleteConfirmModalProps) {
  const toast = useToast();
  const [deleteRemark, setDeleteRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 关闭时重置备注
  useEffect(() => {
    if (!open) {
      setDeleteRemark("");
    }
  }, [open]);

  const handleDeleteConfirm = async () => {
    if (targetId === null) return;
    // 备注必填
    if (!deleteRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    setSubmitting(true);
    try {
      await dataRecordsApi.delete(targetId, deleteRemark.trim());
      toast.success("删除成功");
      onClose();
      setDeleteRemark("");
      await onDeleted();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="删除数据记录"
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
            onClick={handleDeleteConfirm}
            disabled={submitting}
            className="px-4 py-2 bg-red-500 text-white rounded-custom-sm text-sm font-medium hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {submitting ? "删除中..." : "确认删除"}
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
              if (e.key === "Enter" && !submitting) handleDeleteConfirm();
            }}
            className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
          />
        </div>
      </div>
    </Modal>
  );
}
