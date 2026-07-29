import { motion } from 'framer-motion'
import { ArrowLeft, User, Clock, ChevronRight, BarChart3 } from 'lucide-react'
import { Skeleton } from '../../../../components/Skeleton'
import { formatDateTime } from '../../../../utils'
import { SECTION_CONFIG, FIELD_LABELS } from '../config'
import type { FieldAgg } from '../types'
import type { DataLogType } from '../../../../types'

interface FieldCardsViewProps {
  type: DataLogType
  personnelName: string
  fieldAggList: FieldAgg[]
  loading: boolean
  onBack: () => void
  onSelect: (field: FieldAgg['field']) => void
}

/**
 * Level 3: 字段卡片列表（收光/麦序/全麦/主持）
 * 数据指标卡片风格：大图标 + 计数 + 配色边框
 */
export default function FieldCardsView({
  type,
  personnelName,
  fieldAggList,
  loading,
  onBack,
  onSelect,
}: FieldCardsViewProps) {
  const config = SECTION_CONFIG[type]
  const maxCount = fieldAggList.length > 0 ? Math.max(...fieldAggList.map((f) => f.count)) : 0

  return (
    <motion.div
      key={`field-${type}`}
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2.5 py-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded-lg transition-all duration-200 cursor-pointer text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          <span>返回人员列表</span>
        </button>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-surface">
            <User size={14} className="text-textSecondary" />
          </div>
          <span className="text-sm font-medium text-textPrimary">
            {personnelName}
          </span>
          <span className="text-xs text-textMuted">
            · {config.label} · 数据字段
          </span>
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <FieldCardsSkeleton />
      ) : fieldAggList.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {fieldAggList.map((f, idx) => {
            const meta = FIELD_LABELS.find((m) => m.key === f.field)!
            const intensity = maxCount > 0 ? f.count / maxCount : 0
            return (
              <motion.button
                key={f.field}
                onClick={() => onSelect(f.field)}
                className={`group relative overflow-hidden art-card p-4 text-left transition-all duration-300 cursor-pointer border ${meta.bgCls} hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)]`}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.05, 0.3) }}
                whileHover={{ y: -3 }}
              >
                {/* 装饰性大图标 */}
                <div className="absolute -right-1 -bottom-1 opacity-[0.07] pointer-events-none">
                  <BarChart3 size={56} strokeWidth={1.5} />
                </div>

                <div className="relative">
                  {/* 顶部：图标 + 计数 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2 rounded-xl ${meta.bgCls} border`}>
                      <BarChart3 size={18} className={meta.color} strokeWidth={2} />
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-surface text-textPrimary">
                      {f.count}
                    </span>
                  </div>

                  {/* 字段名 */}
                  <div className="text-base font-semibold text-textPrimary">
                    {f.label}
                  </div>

                  {/* 活跃度指示 */}
                  <div className="text-[10px] text-textMuted mt-0.5">
                    {intensity > 0.7 ? '高频' : intensity > 0.3 ? '中频' : '低频'}操作
                  </div>

                  {/* 分隔线 */}
                  <div className="my-2 h-px bg-border/40" />

                  {/* 最后操作时间 */}
                  <div className="flex items-center gap-1 text-[10px] text-textMuted font-mono">
                    <Clock size={10} />
                    <span>{formatDateTime(f.lastTime)}</span>
                  </div>

                  {/* 悬停进入指示 */}
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <ChevronRight size={14} className={meta.color} />
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

function EmptyState() {
  return (
    <div className="art-card px-5 py-20 text-center">
      <div className="inline-flex p-4 rounded-2xl bg-surface mb-4">
        <BarChart3 size={32} className="text-textMuted" />
      </div>
      <p className="text-sm text-textMuted">暂无字段数据</p>
    </div>
  )
}

function FieldCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="art-card p-4">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-8" />
          </div>
          <Skeleton className="h-4 w-14 mb-2" />
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
