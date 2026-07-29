import { motion } from 'framer-motion'
import { Users, ArrowRight, Inbox } from 'lucide-react'
import { SECTION_CONFIG, TYPE_ORDER } from '../config'
import type { DataLogItem, DataLogType } from '../../../../types'

interface TypeCardsViewProps {
  logsByType: Record<DataLogType, DataLogItem[]>
  loading: boolean
  onSelect: (type: DataLogType) => void
}

/**
 * Level 1: 操作类型卡片入口
 * 现代化卡片设计：渐变背景、玻璃态、数据指标、hover 阴影
 */
export default function TypeCardsView({ logsByType, loading, onSelect }: TypeCardsViewProps) {
  const totalCount = TYPE_ORDER.reduce((sum, t) => sum + logsByType[t].length, 0)

  return (
    <motion.div
      key="type-cards"
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 概览统计 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm text-textSecondary">
          <Inbox size={16} className="text-textMuted" />
          <span>选择操作类型</span>
        </div>
        <div className="text-xs text-textMuted">
          共 {totalCount} 条记录
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TYPE_ORDER.map((type, idx) => {
          const config = SECTION_CONFIG[type]
          const Icon = config.icon
          const count = logsByType[type].length
          const personCount = new Set(logsByType[type].map((l) => l.personnelId)).size
          const isEmpty = count === 0
          const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0

          return (
            <motion.button
              key={type}
              onClick={() => onSelect(type)}
              disabled={loading || isEmpty}
              className={`group relative overflow-hidden art-card p-5 text-left transition-all duration-300 cursor-pointer ${config.cardCls} disabled:opacity-50 disabled:cursor-not-allowed`}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
              whileHover={isEmpty ? undefined : { y: -4 }}
            >
              {/* 装饰性渐变背景 */}
              <div className={`absolute inset-0 bg-gradient-to-br ${config.gradientCls} opacity-50 pointer-events-none`} />

              {/* 装饰性大图标（右上角半透明） */}
              <div className="absolute -right-2 -top-2 opacity-[0.06] pointer-events-none">
                <Icon size={80} strokeWidth={1.5} />
              </div>

              <div className="relative">
                {/* 顶部：图标 + 计数 */}
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-2xl ${config.badgeCls} backdrop-blur-sm`}>
                    <Icon size={22} strokeWidth={2} />
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold font-mono ${config.iconCls}`}>
                      {count}
                    </div>
                    <div className="text-[10px] text-textMuted uppercase tracking-wider">
                      条记录
                    </div>
                  </div>
                </div>

                {/* 标题 */}
                <h3 className="text-base font-semibold text-textPrimary mb-1">
                  {config.label}记录
                </h3>
                <p className="text-xs text-textMuted mb-4">
                  {config.desc}
                </p>

                {/* 数据指标 */}
                {count > 0 && (
                  <>
                    {/* 涉及人数 */}
                    <div className="flex items-center gap-2 mb-3 text-xs">
                      <div className="flex items-center gap-1.5 text-textSecondary">
                        <Users size={12} />
                        <span>{personCount} 人</span>
                      </div>
                      <div className="h-3 w-px bg-border" />
                      <div className="text-textMuted">
                        占比 {percentage}%
                      </div>
                    </div>

                    {/* 进度条 */}
                    <div className="h-1 bg-surface rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          type === 'create' ? 'bg-success'
                          : type === 'update' ? 'bg-warning'
                          : 'bg-danger'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, delay: 0.3 + idx * 0.1, ease: 'easeOut' }}
                      />
                    </div>

                    {/* 悬停提示进入 */}
                    <div className="mt-4 flex items-center justify-end text-xs text-textMuted group-hover:text-textPrimary transition-colors duration-200">
                      <span className="mr-1">查看详情</span>
                      <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform duration-200" />
                    </div>
                  </>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
