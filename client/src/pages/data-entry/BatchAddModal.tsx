import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { dataRecordsApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import type { DisplayRow } from "./types";
import { rowKey } from "./types";

interface BatchAddModalProps {
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
  // 共用备注（与批量编辑/删除共享）
  batchRemark: string;
  onBatchRemarkChange: (v: string) => void;
  onSaved: () => void | Promise<void>;
  // 清空选中行的回调
  onClearSelection: () => void;
}

export default function BatchAddModal({
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
}: BatchAddModalProps) {
  const toast = useToast();
  const [batchAddForms, setBatchAddForms] = useState<
    Record<string, { sg: string; mx: string; qm: string; zcDays: string }>
  >({});
  const [batchAddSubmitting, setBatchAddSubmitting] = useState(false);

  // 打开弹窗时初始化：仅列出勾选的行，输入框为空（累加值）
  useEffect(() => {
    if (!open) return;
    const forms: Record<string, { sg: string; mx: string; qm: string; zcDays: string }> = {};
    allRows.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId);
      if (selectedKeys.has(key)) {
        // 输入框初始为空，输入的是要累加的数值
        forms[key] = { sg: "", mx: "", qm: "", zcDays: "" };
      }
    });
    setBatchAddForms(forms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 批量添加：更新某行某字段
  const handleBatchAddFieldChange = (
    key: string,
    field: "sg" | "mx" | "qm" | "zcDays",
    value: string,
  ) => {
    setBatchAddForms((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  // 批量添加提交：累加到已录入数据上（已录入则原值+输入值，未录入则新建为输入值）
  const handleBatchAddSubmit = async () => {
    if (!hasTarget) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    // 备注必填
    if (!batchRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    const entries = Object.entries(batchAddForms);
    if (entries.length === 0) {
      toast.error("无数据可保存");
      return;
    }
    // 解析并校验（key 格式为 `${branchId}:${personnelId}`）
    const parsed: Array<{
      personnelId: number;
      branchId: number;
      // 本次要累加的增量值
      sg: number;
      mx: number;
      qm: number;
      zcDays: number;
    }> = [];
    for (const [key, f] of entries) {
      const [bidStr, pidStr] = key.split(":");
      const branchId = Number(bidStr);
      const personnelId = Number(pidStr);
      // 空值视为 0（即不累加）；厅规则关闭收光/全麦转换时，对应字段强制为 0
      const addSg = !sgInputEnabled ? 0 : f.sg === "" ? 0 : Number(f.sg);
      const addMx = f.mx === "" ? 0 : Number(f.mx);
      const addQm = !qmInputEnabled ? 0 : f.qm === "" ? 0 : Number(f.qm);
      const addZcDays = !zcInputEnabled ? 0 : f.zcDays === "" ? 0 : Number(f.zcDays);
      if (
        (sgInputEnabled && (!Number.isInteger(addSg) || addSg < 0)) ||
        !Number.isInteger(addMx) ||
        addMx < 0 ||
        (qmInputEnabled && (!Number.isInteger(addQm) || addQm < 0)) ||
        (zcInputEnabled && (!Number.isInteger(addZcDays) || addZcDays < 0))
      ) {
        toast.error("收光/麦序/全麦/主持天数必须为非负整数");
        return;
      }
      // 跳过无输入的（避免创建全 0 的空记录）
      if (addSg === 0 && addMx === 0 && addQm === 0 && addZcDays === 0) continue;
      parsed.push({
        personnelId,
        branchId,
        sg: addSg,
        mx: addMx,
        qm: addQm,
        zcDays: addZcDays,
      });
    }

    if (parsed.length === 0) {
      toast.error("所有人员均未输入数据");
      return;
    }

    setBatchAddSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      // 统一使用 create（增量语义）：后端 upsertRecord 会自动累加并触发冠名转换
      for (const item of parsed) {
        try {
          await dataRecordsApi.create({
            personnelId: item.personnelId,
            branchId: item.branchId,
            sg: item.sg,
            mx: item.mx,
            qm: item.qm,
            zcDays: item.zcDays,
            // 合厅组模式：按各厅 statCycle 归一化 weekStart
            weekStart: isGroupMode
              ? getRecordWeekStart(item.branchId)
              : recordWeekStart,
            remark: batchRemark.trim() || undefined,
          });
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        toast.success(`批量添加成功，共 ${successCount} 条`);
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
      setBatchAddSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`添加（${selectedKeys.size} 项）`}
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
            onClick={handleBatchAddSubmit}
            disabled={batchAddSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {batchAddSubmitting ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Save size={16} />
            )}
            {batchAddSubmitting ? "保存中..." : "批量累加"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-textMuted">
          输入的数值会累加到已录入的数据上（原值 +
          输入值）。未录入的行将以此数值创建新记录。留空视为
          0（不累加）。同一人员在多个厅的数据互不影响。
        </p>
        {/* 批量添加备注（共用） */}
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
        <div className="max-h-[60vh] overflow-auto scrollbar-thin border border-border rounded-custom-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border sticky top-0 z-10">
              <tr className="text-textSecondary">
                <th className="px-4 py-2.5 font-medium text-left whitespace-nowrap min-w-[120px]">
                  人员
                </th>
                <th className="px-3 py-2.5 font-medium text-center w-24">
                  收光
                </th>
                <th className="px-3 py-2.5 font-medium text-center w-24">
                  麦序
                </th>
                {qmInputEnabled && (
                  <th className="px-3 py-2.5 font-medium text-center w-24">
                    全麦
                  </th>
                )}
                {zcInputEnabled && (
                  <th className="px-3 py-2.5 font-medium text-center w-28">
                    主持天数
                  </th>
                )}
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
                      className={`border-b border-border last:border-0 transition-colors duration-150 ${
                        !r.isRecorded
                          ? "bg-amber-50/50 dark:bg-amber-900/10"
                          : "hover:bg-surface"
                      }`}
                    >
                      <td className="px-4 py-2 text-textPrimary align-middle whitespace-nowrap">
                        <span className="font-medium">
                          {r.personnelName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={
                            sgInputEnabled ? (batchAddForms[k]?.sg ?? "") : ""
                          }
                          onChange={(e) =>
                            handleBatchAddFieldChange(k, "sg", e.target.value)
                          }
                          placeholder={sgInputEnabled ? "0" : "已关闭"}
                          disabled={!sgInputEnabled}
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={batchAddForms[k]?.mx ?? ""}
                          onChange={(e) =>
                            handleBatchAddFieldChange(k, "mx", e.target.value)
                          }
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                        />
                      </td>
                      {qmInputEnabled && (
                        <td className="px-3 py-2 text-center align-middle">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={batchAddForms[k]?.qm ?? ""}
                            onChange={(e) =>
                              handleBatchAddFieldChange(k, "qm", e.target.value)
                            }
                            placeholder="0"
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                          />
                        </td>
                      )}
                      {zcInputEnabled && (
                        <td className="px-3 py-2 text-center align-middle">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={batchAddForms[k]?.zcDays ?? ""}
                            onChange={(e) =>
                              handleBatchAddFieldChange(k, "zcDays", e.target.value)
                            }
                            placeholder="0"
                            className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                          />
                        </td>
                      )}
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
