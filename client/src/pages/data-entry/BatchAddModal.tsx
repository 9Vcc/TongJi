import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  dataRecordsApi,
  timeSlotMultipliersApi,
  getErrorMessage,
} from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import GroupedSelect from "../../components/GroupedSelect";
import DatePicker from "../../components/DatePicker";
import { formatDate } from "../../utils";
import type { DisplayRow } from "./types";
import { rowKey } from "./types";

// 时间段数量（0-2、2-4、...、22-24，共12个）
const SLOT_COUNT = 12;
// 生成时间段标签：'0-2'、'2-4'、...、'22-24'
const SLOT_LABELS = Array.from(
  { length: SLOT_COUNT },
  (_, i) => `${i * 2}-${i * 2 + 2}`,
);

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
  // 时间段倍率功能开关（单厅或合厅模式均可能为 true）
  mxSlotEnabled: boolean;
  // 当前生效厅 ID（用于查询时间段倍率，单厅模式）
  effectiveBranchId?: number;
  // 合厅组成员厅 ID 列表（用于查询时间段倍率，合厅模式）
  effectiveBranchIds?: number[];
  isHuizhang: boolean;
  isGroupMode: boolean;
  hasTarget: boolean;
  // 共用备注（与批量编辑/删除共享；时间段模式下不使用）
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
  mxSlotEnabled,
  effectiveBranchId,
  effectiveBranchIds,
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

  // 时间段模式专用状态
  const [slotDate, setSlotDate] = useState<string>(formatDate(new Date()));
  const [slotIndex, setSlotIndex] = useState<number>(0);
  // 当前厅各时间段的倍率（打开弹窗时加载，缺失默认 1）
  const [slotMultipliers, setSlotMultipliers] = useState<number[]>(
    Array(SLOT_COUNT).fill(1),
  );

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
    // 时间段模式：重置日期为今天，时间段为 0
    if (mxSlotEnabled) {
      setSlotDate(formatDate(new Date()));
      setSlotIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 时间段模式：打开弹窗时加载时间段倍率
  // 单厅模式取当前厅；合厅模式取首个成员厅（合并管理后所有厅倍率一致）
  useEffect(() => {
    if (!open || !mxSlotEnabled) return;
    const targetBranchId = isGroupMode
      ? effectiveBranchIds?.[0]
      : effectiveBranchId;
    if (targetBranchId === undefined) return;
    timeSlotMultipliersApi
      .get(targetBranchId)
      .then((multipliers) => {
        const arr = Array(SLOT_COUNT).fill(1);
        for (const m of multipliers) {
          if (m.slotIndex >= 0 && m.slotIndex < SLOT_COUNT) {
            arr[m.slotIndex] = m.multiplier;
          }
        }
        setSlotMultipliers(arr);
      })
      .catch(() => {
        // 倍率加载失败保持默认 1
      });
  }, [open, mxSlotEnabled, effectiveBranchId, isGroupMode, effectiveBranchIds]);

  // 当前选中时间段的倍率
  const currentMultiplier = slotMultipliers[slotIndex] ?? 1;

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
    // 备注必填（含时间段模式）
    if (!batchRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    // 时间段模式：日期和时间段必填（日期默认今天，必填校验）
    if (mxSlotEnabled && !slotDate) {
      toast.error("请选择日期");
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
        Number.isNaN(addMx) ||
        addMx < 0 ||
        (qmInputEnabled && (!Number.isInteger(addQm) || addQm < 0)) ||
        (zcInputEnabled && (!Number.isInteger(addZcDays) || addZcDays < 0))
      ) {
        toast.error("收光/全麦/主持天数必须为非负整数，麦序必须为非负数");
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
      if (mxSlotEnabled) {
        // 时间段模式：调用 createSlot 接口
        // 单厅模式：所有记录一次提交；合厅模式：按 branchId 分组逐厅提交
        if (isGroupMode) {
          // 按 branchId 分组
          const groupMap = new Map<number, typeof parsed>();
          for (const p of parsed) {
            const arr = groupMap.get(p.branchId) ?? []
            arr.push(p)
            groupMap.set(p.branchId, arr)
          }
          // 逐厅调用 createSlot
          for (const [branchId, items] of groupMap) {
            try {
              await dataRecordsApi.createSlot({
                branchId,
                weekStart: getRecordWeekStart(branchId),
                slotDate,
                slotIndex,
                records: items.map((p) => ({
                  personnelId: p.personnelId,
                  sg: p.sg,
                  rawMx: p.mx,
                  qm: p.qm,
                  zcDays: p.zcDays,
                })),
                remark: batchRemark.trim(),
              });
              successCount += items.length;
            } catch {
              failCount += items.length;
            }
          }
        } else {
          // 单厅模式
          const targetBranchId = parsed[0].branchId;
          try {
            await dataRecordsApi.createSlot({
              branchId: targetBranchId,
              weekStart: recordWeekStart,
              slotDate,
              slotIndex,
              records: parsed.map((p) => ({
                personnelId: p.personnelId,
                sg: p.sg,
                rawMx: p.mx,
                qm: p.qm,
                zcDays: p.zcDays,
              })),
              remark: batchRemark.trim(),
            });
            successCount = parsed.length;
          } catch {
            failCount = parsed.length;
          }
        }
      } else {
        // 普通模式：统一使用 create（增量语义）：后端 upsertRecord 会自动累加并触发冠名转换
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
      }
      if (failCount === 0) {
        toast.success(`批量添加成功，共 ${successCount} 条`);
      } else {
        toast.error(`部分失败：成功 ${successCount} 条，失败 ${failCount} 条`);
      }
      onClose();
      onClearSelection();
      if (!mxSlotEnabled) {
        onBatchRemarkChange("");
      }
      await onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBatchAddSubmitting(false);
    }
  };

  // 麦序列头显示文本（时间段模式追加倍率提示）
  const mxColumnHeader = useMemo(() => {
    if (!mxSlotEnabled) return "麦序";
    return `麦序 × ${currentMultiplier}`;
  }, [mxSlotEnabled, currentMultiplier]);

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
          {mxSlotEnabled
            ? `选择日期和时间段后输入数值，系统按该时间段倍率自动换算麦序（当前倍率 × ${currentMultiplier}）。其他数值（收光/全麦/主持天数）不参与倍率换算，直接累加到原值。`
            : "输入的数值会累加到已录入的数据上（原值 + 输入值）。未录入的行将以此数值创建新记录。留空视为 0（不累加）。同一人员在多个厅的数据互不影响。"}
        </p>

        {/* 顶部输入区域：时间段模式显示日期+时间段选择 */}
        {mxSlotEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                日期
                <span className="text-danger ml-0.5">*</span>
              </label>
              <DatePicker
                value={slotDate}
                onChange={setSlotDate}
                fullWidth
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                时间段
                <span className="text-danger ml-0.5">*</span>
                <span className="ml-1 text-[10px] text-textMuted">
                  （倍率 × {currentMultiplier}）
                </span>
              </label>
              <GroupedSelect
                value={String(slotIndex)}
                onChange={(val) => setSlotIndex(Number(val))}
                fullWidth
                options={SLOT_LABELS.map((label, idx) => ({
                  value: String(idx),
                  label: `${label} 时段（× ${slotMultipliers[idx] ?? 1}）`,
                }))}
              />
            </div>
          </div>
        )}

        {/* 备注：两种模式共用 */}
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            备注
            <span className="text-danger ml-0.5">*</span>
            <span className="ml-1 text-[10px] text-textMuted">
              （共用，覆盖原有备注）
            </span>
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
                  {mxColumnHeader}
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
                  const rawMx = batchAddForms[k]?.mx ?? "";
                  const rawMxNum = rawMx === "" ? 0 : Number(rawMx);
                  const convertedMx =
                    mxSlotEnabled && rawMx !== ""
                      ? Number((rawMxNum * currentMultiplier).toFixed(2))
                      : null;
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
                        {mxSlotEnabled && convertedMx !== null && (
                          <div className="text-[10px] text-primary mt-0.5 font-mono">
                            = {convertedMx}
                          </div>
                        )}
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
