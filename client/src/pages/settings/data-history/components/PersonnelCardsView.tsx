import { motion } from 'framer-motion'
import { ArrowLeft, Building2, Clock, ChevronRight } from 'lucide-react'
import { Skeleton } from '../../../../components/Skeleton'
import { formatDateTime } from '../../../../utils'
import { SECTION_CONFIG } from '../config'
import { PERSONNEL_PAGE_SIZE } from '../types'
import type { PersonnelAgg } from '../types'
import type { DataLogType } from '../../../../types'
import Pagination from './Pagination'

interface PersonnelCardsViewProps {
  type: DataLogType
  personnelAggList: PersonnelAgg[]
  loading: boolean
  currentPage: number
  totalPages: number
  onBack: () => void
  onSelect: (personnelId: number) => void
  onPageChange: (page: number) => void
}

// 生成基于姓名的稳定颜色（用于头像背景）
function getAvatarColor(name: string): string {
  const colors = [
    'bg-primary/15 text-primary',
    'bg-warning/15 text-warning',
    'bg-success/15 text-success',
    'bg-info/15 text-info',
    'bg-purple-500/15 text-purple-500',
    'bg-pink-500/15 text-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Level 2: 人员卡片列表
 * 头像式设计：彩色头像、数据指标、现代化布局
 */
export default function PersonnelCardsView({
  type,
  personnelAggList,
  loading,
  currentPage,
  totalPages,
  onBack,
  onSelect,
  onPageChange,
}: PersonnelCardsViewProps) {
  const config = SECTION_CONFIG[type]
  const Icon = config.icon

  const start = (currentPage - 1) * PERSONNEL_PAGE_SIZE
  const pagedPersonnelAgg = personnelAggList.slice(start, start + PERSONNEL_PAGE_SIZE)

  return (
    <motion.div
      key={`personnel-${type}`}
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
          <span>返回类型</span>
        </button>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${config.badgeCls}`}>
            <Icon size={14} strokeWidth={2} />
          </div>
          <span className="text-sm font-medium text-textPrimary">
            {config.label}记录 · 人员列表
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeCls}`}>
            {personnelAggList.length} 人
          </span>
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <PersonnelCardsSkeleton />
      ) : pagedPersonnelAgg.length === 0 ? (
        <EmptyState text={`暂无${config.label}记录`} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {pagedPersonnelAgg.map((p, idx) => {
              const avatarColor = getAvatarColor(p.personnelName)
              return (
                <motion.button
                  key={p.personnelId}
                  onClick={() => onSelect(p.personnelId)}
                  className={`group relative overflow-hidden art-card p-4 text-left transition-all duration-300 cursor-pointer ${config.cardCls}`}
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
                  whileHover={{ y: -3 }}
                >
                  {/* 顶部：头像 + 次数徽标 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className={`flex items-center justify-center w-9 h-9 rounded-full font-semibold text-sm ${avatarColor}`}>
                      {p.personnelName.charAt(0)}
                    </div>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${config.badgeCls}`}>
                      {p.count}
                    </span>
                  </div>

                  {/* 人员姓名 */}
                  <div className="text-sm font-semibold text-textPrimary truncate">
                    {p.personnelName}
                  </div>

                  {/* 所属厅 */}
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-textMuted truncate">
                    <Building2 size={10} className="flex-shrink-0" />
                    <span className="truncate">{p.branchName}</span>
                  </div>

                  {/* 分隔线 */}
                  <div className="my-2 h-px bg-border/40" />

                  {/* 最后操作时间 */}
                  <div className="flex items-center gap-1 text-[10px] text-textMuted font-mono">
                    <Clock size={10} />
                    <span>{formatDateTime(p.lastTime)}</span>
                  </div>

                  {/* 悬停进入指示 */}
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <ChevronRight size={14} className={config.iconCls} />
                  </div>
                </motion.button>
              )
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={personnelAggList.length}
            itemLabel="人"
            onPageChange={onPageChange}
          />
        </>
      )}
    </motion.div>
  )
}

// 空状态
function EmptyState({ text }: { text: string }) {
  return (
    <div className="art-card px-5 py-20 text-center">
      <div className="inline-flex p-4 rounded-2xl bg-surface mb-4">
        <Building2 size={32} className="text-textMuted" />
      </div>
      <p className="text-sm text-textMuted">{text}</p>
    </div>
  )
}

function PersonnelCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="art-card p-4">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 w-8" />
          </div>
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
