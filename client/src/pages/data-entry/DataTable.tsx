import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Pencil, Trash2, Ban } from "lucide-react";
import { TableSkeleton } from "../../components/Skeleton";
import { formatNamings } from "../../utils";
import type { StatCycle } from "../../types";
import type { DisplayRow, EditableRecord } from "./types";
import { rowKey } from "./types";

interface DataTableProps {
  // 动画 key（用于切换周/厅时触发入场动画）
  animationKey: string;
  loading: boolean;
  hasRecords: boolean;
  effectiveBranchId: number | undefined;
  // 合厅组模式相关
  isGroupMode: boolean;
  mergeSameName: boolean;
  searchTerm: string;
  pagedRecords: DisplayRow[];
  filteredCount: number;
  // 选择状态
  selectedKeys: Set<string>;
  onToggleSelect: (branchId: number | undefined, personnelId: number) => void;
  onToggleSelectAll: () => void;
  // 编辑/删除回调
  onEdit: (record: EditableRecord) => void;
  onDelete: (id: number) => void;
  canDelete: boolean;
  // 输入开关
  qmInputEnabled: boolean;
  zcInputEnabled: boolean;
  branchCycle: StatCycle;
  // 分页
  safePage: number;
  totalPages: number;
  onSetPage: (updater: (p: number) => number) => void;
}

export default function DataTable({
  animationKey,
  loading,
  hasRecords,
  effectiveBranchId,
  isGroupMode,
  mergeSameName,
  searchTerm,
  pagedRecords,
  filteredCount,
  selectedKeys,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  canDelete,
  qmInputEnabled,
  zcInputEnabled,
  branchCycle,
  safePage,
  totalPages,
  onSetPage,
}: DataTableProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={animationKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {loading && !hasRecords ? (
          <TableSkeleton rows={6} columns={8} />
        ) : (
          <div className="art-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    <th className="px-3 py-3 font-medium w-10">
                      <input
                        type="checkbox"
                        checked={
                          pagedRecords.length > 0 &&
                          pagedRecords.every((r) =>
                            selectedKeys.has(
                              rowKey(r.branchId, r.personnelId),
                            ),
                          )
                        }
                        onChange={onToggleSelectAll}
                        className="checkbox-round cursor-pointer"
                        title="全选/取消全选（当前页）"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">人员</th>
                    <th className="px-4 py-3 font-medium">收光</th>
                    <th className="px-4 py-3 font-medium">麦序</th>
                    {qmInputEnabled && (
                      <th className="px-4 py-3 font-medium">全麦</th>
                    )}
                    {zcInputEnabled && (
                      <th className="px-4 py-3 font-medium">主持</th>
                    )}
                    {branchCycle === "MONTH" && (
                      <th className="px-4 py-3 font-medium">冠名</th>
                    )}
                    <th className="px-4 py-3 font-medium">福利</th>
                    <th className="px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          // 勾选框 + 人员 + 收光 + 麦序 + (全麦) + (主持) + (冠名) + 福利 + 操作
                          5 +
                          (qmInputEnabled ? 1 : 0) +
                          (zcInputEnabled ? 1 : 0) +
                          (branchCycle === "MONTH" ? 1 : 0)
                        }
                        className="px-4 py-12 text-center text-textMuted"
                      >
                        {!isGroupMode && !effectiveBranchId
                          ? "请选择厅后查看数据"
                          : searchTerm
                            ? "未找到匹配的人员"
                            : "暂无数据"}
                      </td>
                    </tr>
                  ) : (
                    pagedRecords.map((r) => (
                      <tr
                        key={r.key}
                        className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                          !r.isRecorded ? "opacity-60" : ""
                        } ${selectedKeys.has(rowKey(r.branchId, r.personnelId)) ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(
                              rowKey(r.branchId, r.personnelId),
                            )}
                            onChange={() =>
                              onToggleSelect(r.branchId, r.personnelId)
                            }
                            className="checkbox-round cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 text-textPrimary">
                          <div className="flex items-center gap-2">
                            <span>{r.personnelName}</span>
                            {/* 合厅组模式：标注所属厅名 */}
                            {isGroupMode && r.branchName && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                                {r.branchName}
                              </span>
                            )}
                            {/* 无福利标记徽标 */}
                            {r.noWelfare && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-danger/10 text-danger"
                                title={
                                  r.noWelfareRemark
                                    ? `无福利标记：${r.noWelfareRemark}`
                                    : "无福利标记：本期所有福利清零"
                                }
                              >
                                <Ban size={10} />
                                无福利
                              </span>
                            )}
                            {/* 合并同名模式：聚合标识 */}
                            {isGroupMode && mergeSameName && r.isRecorded && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-textMuted/10 text-textMuted"
                                title="合并行，排名不显示"
                              >
                                合并
                              </span>
                            )}
                            {!r.isRecorded && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-textMuted/10 text-textMuted">
                                未录入
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-mono">
                          {r.isRecorded ? r.sg : "-"}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-mono">
                          {r.isRecorded ? r.mx : "-"}
                        </td>
                        {qmInputEnabled && (
                          <td className="px-4 py-3 text-textPrimary font-mono">
                            {r.isRecorded ? r.qm : "-"}
                          </td>
                        )}
                        {zcInputEnabled && (
                          <td className="px-4 py-3 text-textPrimary font-mono">
                            {r.isRecorded ? r.zcDays : "-"}
                          </td>
                        )}
                        {branchCycle === "MONTH" && (
                          <td className="px-4 py-3 text-textPrimary text-xs whitespace-nowrap">
                            {r.isRecorded ? formatNamings(r.namings) : "-"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-textPrimary font-mono">
                          {r.finalWelfare !== undefined
                            ? r.deduction
                              ? `${r.finalWelfare} (-${r.deduction})`
                              : r.finalWelfare
                            : (r.welfare ?? "-")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {/* 合并同名模式下禁用编辑/删除（聚合行无法定位单条记录） */}
                          {r.isRecorded && !(isGroupMode && mergeSameName) ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() =>
                                  onEdit({
                                    id: r.id,
                                    personnelId: r.personnelId,
                                    branchId: r.branchId,
                                    sg: r.sg,
                                    mx: r.mx,
                                    qm: r.qm,
                                    zcDays: r.zcDays,
                                    namings: r.namings,
                                  })
                                }
                                className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                                title="编辑"
                              >
                                <Pencil size={16} />
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => onDelete(r.id)}
                                  className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                                  title="删除"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-textMuted text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* 分页控件：每页最多 30 人 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
                <span className="text-textSecondary">
                  第 {safePage} / {totalPages} 页（共 {filteredCount}{" "}
                  人）
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onSetPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                    title="上一页"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-3 text-textPrimary font-mono">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      onSetPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage >= totalPages}
                    className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                    title="下一页"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
