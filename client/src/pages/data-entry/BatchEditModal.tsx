import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { dataRecordsApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import type { DisplayRow } from "./types";
import { rowKey } from "./types";

interface BatchEditModalProps {
  open: boolean;
  onClose: () => void;
  allRows: DisplayRow[];
  selectedKeys: Set<string>;
  recordWeekStart: string;
  // 合厅组模式：按各厅 statCycle 归一化录入 weekStart
  getRecordWeekStart: (branchId?: number) => string;
  sgInputEnabled: boolean;
  qmInputEnabled: boolean;
  zcInputEnabled: boolean;
  isHuizhang: boolean;
  isGroupMode: boolean;
  hasTarget: boolean;
  // 共用备注（与批量添加/删除共享）
  batchRemark: string;
  onBatchRemarkChange: (v: string) => void;
  onSaved: () => void | Promise<void>;
  // 清空选中行的回调
  onClearSelection: () => void;
}

export default function BatchEditModal({
  open,
  onClose,
  allRows,
  selectedKeys,
  recordWeekStart,
  getRecordWeekStart,
  sgInputEnabled,
  qmInputEnabled,
  zcInputEnabled,
  isHuizhang,
  isGroupMode,
  hasTarget,
  batchRemark,
  onBatchRemarkChange,
  onSaved,
  onClearSelection,
}: BatchEditModalProps) {
  const toast = useToast();
  // 每行的编辑表单：行 key（`${branchId}:${personnelId}`）-> { sg, mx, qm, zcDays }
  const [batchForms, setBatchForms] = useState<
    Record<string, { sg: string; mx: string; qm: string; zcDays: string }>
  >({});
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // 打开弹窗时初始化每个选中行的表单数据
  useEffect(() => {
    if (!open) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    if (!hasTarget) {
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
            // 合厅组模式：按各厅 statCycle 归一化 weekStart
            await dataRecordsApi.create({
              personnelId: item.personnelId,
              branchId: item.branchId,
              sg: item.sg,
              mx: item.mx,
              qm: item.qm,
              zcDays: item.zcDays,
              weekStart: isGroupMode
                ? getRecordWeekStart(item.branchId)
                : recordWeekStart,
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
      onClose();
      onClearSelection();
      onBatchRemarkChange("");
      await onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBatchSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`编辑（${selectedKeys.size} 项）`}
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
            onClick={handleBatchSubmit}
            disabled={batchSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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
            onChange={(e) => onBatchRemarkChange(e.target.value)}
            placeholder="必填，最多 100 字"
            className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
                  className={`p-3 border rounded-custom-sm ${
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
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-warning/10 text-warning">
                          未录入
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-textMuted">
                      {r.branchName || "-"}
                    </span>
                  </div>
                  <div
                    className={`grid gap-2 ${
                      qmInputEnabled && zcInputEnabled
                        ? "grid-cols-4"
                        : qmInputEnabled || zcInputEnabled
                          ? "grid-cols-3"
                          : "grid-cols-2"
                    }`}
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
                        className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                      />
                    </div>
                    {qmInputEnabled && (
                      <div>
                        <label className="block text-[10px] text-textSecondary mb-0.5">
                          全麦
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={batchForms[k]?.qm ?? ""}
                          onChange={(e) =>
                            handleBatchFieldChange(k, "qm", e.target.value)
                          }
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                        />
                      </div>
                    )}
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
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
  );
}
