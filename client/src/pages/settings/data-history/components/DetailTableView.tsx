import { motion } from 'framer-motion'
import { ArrowLeft, MessageSquare, Calendar, Clock, Building2, User, Layers } from 'lucide-react'
import { Skeleton } from '../../../../components/Skeleton'
import { formatDateTime } from '../../../../utils'
import { SECTION_CONFIG, FIELD_LABELS } from '../config'
import { DETAIL_PAGE_SIZE } from '../types'
import type { FieldKey } from '../types'
import { formatPeriod, formatSlot, paginate } from '../helpers'
import type { DataLogItem, DataLogType } from '../../../../types'
import ChangeCell from './ChangeCell'
import Pagination from './Pagination'

interface DetailTableViewProps {
  type: DataLogType
  personnelName: string
  field: FieldKey
  detailLogs: DataLogItem[]
  loading: boolean
  currentPage: number
  totalPages: number
  personnelMap: Map<number, string>
  onBack: () => void
  onPageChange: (page: number) => void
}

/**
 * Level 4: 字段详细操作记录表格
 * 现代化表格：行内操作类型徽标、时间轴、悬停高亮
 */
export default function DetailTableView({
  type,
  personnelName,
  field,
  detailLogs,
  loading,
  currentPage,
  totalPages,
  personnelMap,
  onBack,
  onPageChange,
}: DetailTableViewProps) {
  const config = SECTION_CONFIG[type]
  const Icon = config.icon
  const fieldMeta = FIELD_LABELS.find((f) => f.key === field)
  const pagedDetailLogs = paginate(detailLogs, currentPage, DETAIL_PAGE_SIZE)

  return (
    <motion.div
      key={`detail-${type}-${field}`}
      className="art-card overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-surface/50 to-transparent">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2.5 py-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded-lg transition-all duration-200 cursor-pointer group"
            title="返回字段列表"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${config.badgeCls}`}>
              <Icon size={16} strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-textPrimary">
                  {personnelName}
                </h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeCls}`}>
                  {config.label}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-textMuted">
                <Layers size={11} />
                <span>{fieldMeta?.label} · 详细记录</span>
              </div>
            </div>
          </div>
        </div>

        {/* 计数徽标 */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className={`text-xl font-bold font-mono ${config.iconCls}`}>
              {detailLogs.length}
            </div>
            <div className="text-[10px] text-textMuted uppercase tracking-wider">
              条记录
            </div>
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface/30 border-b border-border">
            <tr className="text-left text-textMuted">
              <th className="px-4 py-2.5 font-medium whitespace-nowrap text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Clock size={11} />
                  <span>时间</span>
                </div>
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <User size={11} />
                  <span>操作人</span>
                </div>
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Building2 size={11} />
                  <span>厅</span>
                </div>
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Calendar size={11} />
                  <span>周期</span>
                </div>
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Layers size={11} />
                  <span>时段</span>
                </div>
              </th>
              <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider">
                变更内容
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap text-xs uppercase tracking-wider">
                备注
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DetailTableSkeleton rows={8} />
            ) : pagedDetailLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <div className="inline-flex p-3 rounded-2xl bg-surface mb-3">
                    <Layers size={28} className="text-textMuted" />
                  </div>
                  <p className="text-sm text-textMuted">
                    暂无{fieldMeta?.label}记录
                  </p>
                </td>
              </tr>
            ) : (
              pagedDetailLogs.map((log, idx) => (
                <motion.tr
                  key={`${log.type}-${log.id}`}
                  className="border-b border-border/60 last:border-0 hover:bg-surface/50 transition-colors duration-200 group"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                >
                  {/* 时间 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-textPrimary">
                        {formatDateTime(log.time).split(' ')[0]}
                      </span>
                      <span className="font-mono text-[10px] text-textMuted">
                        {formatDateTime(log.time).split(' ')[1] || ''}
                      </span>
                    </div>
                  </td>

                  {/* 操作人 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex-shrink-0">
                        {log.operatorName.charAt(0)}
                      </div>
                      <span className="text-textPrimary font-medium text-xs">
                        {log.operatorName}
                      </span>
                    </div>
                  </td>

                  {/* 厅 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-textSecondary text-xs">
                      {log.branchName}
                    </span>
                  </td>

                  {/* 周期 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-surface text-textSecondary font-mono">
                      {formatPeriod(log.weekStart)}
                    </span>
                  </td>

                  {/* 时段 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {log.slotDate && log.slotIndex !== undefined ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] text-textSecondary">
                          {log.slotDate}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-mono">
                            {formatSlot(log.slotIndex)}
                          </span>
                          {log.multiplier !== undefined && log.multiplier !== 1 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-warning/10 text-warning font-mono">
                              ×{log.multiplier}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-textMuted text-xs">-</span>
                    )}
                  </td>

                  {/* 变更内容 */}
                  <td className="px-4 py-3">
                    <ChangeCell log={log} personnelMap={personnelMap} filterField={field} />
                  </td>

                  {/* 备注 */}
                  <td className="px-4 py-3 text-xs max-w-[200px]">
                    {log.remark ? (
                      <div
                        className="flex items-start gap-1 text-textSecondary"
                        title={log.remark}
                      >
                        <MessageSquare size={11} className="text-textMuted mt-0.5 flex-shrink-0" />
                        <span className="truncate">{log.remark}</span>
                      </div>
                    ) : (
                      <span className="text-textMuted">-</span>
                    )}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={detailLogs.length}
        onPageChange={onPageChange}
      />
    </motion.div>
  )
}

function DetailTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border/60 last:border-0">
          {Array.from({ length: 7 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-5 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
