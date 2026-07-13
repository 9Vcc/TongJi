import { useEffect, useState } from "react";
import {
  dataRecordsApi,
  deductionsApi,
  getErrorMessage,
} from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import SearchableSelect from "../../components/SearchableSelect";
import { Spinner } from "../../components/Skeleton";
import { formatDate } from "../../utils";
import type {
  DataRecord,
  NamingLevel,
  StatCycle,
} from "../../types";
import { emptyForm, type EditableRecord, type RecordForm } from "./types";

interface EditRecordModalProps {
  open: boolean;
  onClose: () => void;
  // 当打开时传入的记录
  record: EditableRecord | null;
  // 上下文
  effectiveBranchId: number | undefined;
  weekStart: Date;
  branchCycle: StatCycle;
  namingLevels: NamingLevel[];
  personnelOptions: { value: string; label: string }[];
  // 当前所有记录（用于查找原始记录的 personnelId）
  records: DataRecord[];
  // 输入开关
  sgInputEnabled: boolean;
  qmInputEnabled: boolean;
  zcInputEnabled: boolean;
  editNamingsEnabled: boolean;
  // 是否可编辑扣减
  canEditDeduction: boolean;
  // 成功回调
  onSaved: () => void | Promise<void>;
}

export default function EditRecordModal({
  open,
  onClose,
  record,
  effectiveBranchId,
  weekStart,
  branchCycle,
  namingLevels,
  personnelOptions,
  records,
  sgInputEnabled,
  qmInputEnabled,
  zcInputEnabled,
  editNamingsEnabled,
  canEditDeduction,
  onSaved,
}: EditRecordModalProps) {
  const toast = useToast();
  const [editForm, setEditForm] = useState<RecordForm>(emptyForm);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 当 record 变化时初始化表单
  useEffect(() => {
    if (!record) return;
    // 填充现有冠名数量：基于当前厅的冠名等级初始化（值为 0 时显示空字符串便于输入）
    const namingMap: Record<string, string> = {};
    if (editNamingsEnabled) {
      const existingMap = new Map<number, number>();
      for (const n of record.namings ?? []) {
        existingMap.set(n.levelId, n.count);
      }
      for (const lv of namingLevels) {
        const cnt = existingMap.get(lv.id) ?? 0;
        namingMap[String(lv.id)] = cnt ? String(cnt) : "";
      }
    }
    setEditForm({
      personnelId: String(record.personnelId),
      sg: record.sg ? String(record.sg) : "",
      mx: record.mx ? String(record.mx) : "",
      qm: record.qm ? String(record.qm) : "",
      zcDays: String(record.zcDays ?? 0),
      namings: namingMap,
      deduction: record.deduction ? String(record.deduction) : "",
      // 备注不预填历史值，每次编辑都需要重新填写
      remark: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // 编辑弹窗提交
  const handleEditSubmit = async () => {
    if (!record) return;
    const editingId = record.id;
    if (!editForm.personnelId) {
      toast.error("请选择人员");
      return;
    }
    // 备注必填
    if (!editForm.remark.trim()) {
      toast.error("请填写备注");
      return;
    }
    // 厅规则关闭收光/全麦转换时，对应字段强制为 0 不参与录入
    const sg = sgInputEnabled ? Number(editForm.sg) : 0;
    const mx = Number(editForm.mx);
    const qm = qmInputEnabled ? Number(editForm.qm) : 0;
    const zcDays = zcInputEnabled ? Number(editForm.zcDays) : 0;
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

    // 扣减金额校验（会长+超管+管理可编辑）
    const deductionRaw = editForm.deduction.trim();
    const deduction = deductionRaw === "" ? 0 : Number(deductionRaw);
    if (canEditDeduction && (!Number.isInteger(deduction) || deduction < 0)) {
      toast.error("扣减金额必须为非负整数");
      return;
    }

    // 校验并构造冠名数量数组（仅按月统计厅启用）
    let namings: { levelId: number; count: number }[] | undefined;
    if (editNamingsEnabled) {
      namings = [];
      for (const lv of namingLevels) {
        const raw = editForm.namings[String(lv.id)] ?? "0";
        const cnt = Number(raw);
        if (!Number.isInteger(cnt) || cnt < 0) {
          toast.error(`冠名「${lv.name}」必须为非负整数`);
          return;
        }
        namings.push({ levelId: lv.id, count: cnt });
      }
    }

    setEditSubmitting(true);
    try {
      const payload: {
        sg: number;
        mx: number;
        qm: number;
        zcDays: number;
        personnelId?: number;
        namings?: { levelId: number; count: number }[];
        remark?: string;
      } = { sg, mx, qm, zcDays };
      if (namings) payload.namings = namings;
      // 备注始终传递（覆盖式存储：空字符串会清空备注）
      payload.remark = editForm.remark.trim();
      const original = records.find((r) => r.id === editingId);
      const targetPersonnelId =
        original && original.personnelId !== Number(editForm.personnelId)
          ? Number(editForm.personnelId)
          : original?.personnelId;
      if (original && original.personnelId !== Number(editForm.personnelId)) {
        payload.personnelId = Number(editForm.personnelId);
      }
      await dataRecordsApi.update(editingId, payload);

      // 保存扣减（仅会长+超管，且必须有厅和人员）
      // 扣减周期必须基于厅的统计周期（branchCycle），而非用户视图周期（isMonthCycle），
      // 否则与 data-query.ts 查询时的周期匹配不一致，会导致扣减保存了但查不到
      // 扣减为 0 时删除记录（实现"可增删"语义），正值时 upsert
      if (canEditDeduction && effectiveBranchId && targetPersonnelId) {
        const cycleParam: "WEEK" | "MONTH" =
          branchCycle === "MONTH" ? "MONTH" : "WEEK";
        const weekParam = formatDate(
          branchCycle === "MONTH"
            ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
            : weekStart,
        );
        try {
          if (deduction === 0) {
            // 扣减为 0：删除该周期扣减记录（清零）
            await deductionsApi.remove({
              branchId: effectiveBranchId,
              personnelId: targetPersonnelId,
              weekStart: weekParam,
              cycle: cycleParam,
            });
          } else {
            // 正值：upsert 覆盖旧值（可增可减）
            await deductionsApi.upsert({
              branchId: effectiveBranchId,
              personnelId: targetPersonnelId,
              weekStart: weekParam,
              cycle: cycleParam,
              amount: deduction,
            });
          }
        } catch (err) {
          // 扣减保存失败不阻塞主流程，仅提示
          toast.error("数据已更新，但扣减保存失败：" + getErrorMessage(err));
        }
      }

      toast.success("修改成功");
      onClose();
      // 重置表单（含备注），避免下次打开弹窗时残留上次输入的备注
      setEditForm(emptyForm);
      await onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="编辑数据"
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
            onClick={handleEditSubmit}
            disabled={editSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {editSubmitting && <Spinner className="h-4 w-4" />}
            {editSubmitting ? "保存中..." : "保存"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 人员 */}
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            人员
          </label>
          <SearchableSelect
            value={editForm.personnelId}
            onChange={(val) => setEditForm({ ...editForm, personnelId: val })}
            options={personnelOptions}
            placeholder="搜索人员姓名"
            emptyText="无匹配人员"
          />
        </div>
        {/* 收光 / 麦序 / 全麦 */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              收光
              {!sgInputEnabled && (
                <span className="ml-1 text-[10px] text-textMuted">
                  （已关闭）
                </span>
              )}
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={sgInputEnabled ? editForm.sg : ""}
              onChange={(e) =>
                setEditForm({ ...editForm, sg: e.target.value })
              }
              placeholder={sgInputEnabled ? "0" : "已关闭"}
              disabled={!sgInputEnabled}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              麦序
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={editForm.mx}
              onChange={(e) =>
                setEditForm({ ...editForm, mx: e.target.value })
              }
              placeholder="0"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              全麦
              {!qmInputEnabled && (
                <span className="ml-1 text-[10px] text-textMuted">
                  （已关闭）
                </span>
              )}
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={qmInputEnabled ? editForm.qm : ""}
              onChange={(e) =>
                setEditForm({ ...editForm, qm: e.target.value })
              }
              placeholder={qmInputEnabled ? "0" : "已关闭"}
              disabled={!qmInputEnabled}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* 主持天数：仅厅管理页开启主持福利时显示 */}
        {zcInputEnabled && (
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              主持天数
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={editForm.zcDays}
              onChange={(e) =>
                setEditForm({ ...editForm, zcDays: e.target.value })
              }
              placeholder="0"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
        )}

        {/* 冠名数量：仅按月统计厅且已配置冠名等级时显示 */}
        {editNamingsEnabled && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-textSecondary">
                冠名数量
              </label>
              <span className="text-[10px] text-textMuted">
                阈值 = 该等级每达到一次需要的收光数
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {namingLevels.map((lv) => (
                <div key={lv.id}>
                  <label className="block text-[11px] text-textSecondary mb-0.5">
                    {lv.name}
                    <span className="ml-1 text-textMuted">
                      （阈值{lv.threshold}）
                    </span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editForm.namings[String(lv.id)] ?? ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        namings: {
                          ...editForm.namings,
                          [String(lv.id)]: e.target.value,
                        },
                      })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-textMuted">
              提示：编辑冠名数量为覆盖模式，将直接保存为该记录当前的冠名总数。
            </p>
          </div>
        )}

        {/* 福利扣减：会长+超管+管理可编辑 */}
        {canEditDeduction && (
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              福利扣减
              <span className="ml-1 text-[10px] text-textMuted">
                （{branchCycle === "MONTH" ? "按月" : "按周"}扣减，最终福利 =
                福利 - 扣减）
              </span>
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={editForm.deduction}
              onChange={(e) =>
                setEditForm({ ...editForm, deduction: e.target.value })
              }
              placeholder="0"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
        )}

        {/* 操作备注：覆盖式存储到记录，显示在数据录入页搜索框后 */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-textSecondary mb-1">
            备注
            <span className="text-danger ml-0.5">*</span>
            <span className="ml-1 text-[10px] text-textMuted">
              （将覆盖该记录原备注）
            </span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={editForm.remark}
            onChange={(e) =>
              setEditForm({ ...editForm, remark: e.target.value })
            }
            placeholder="必填，最多 100 字"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
          />
        </div>
      </div>
    </Modal>
  );
}
