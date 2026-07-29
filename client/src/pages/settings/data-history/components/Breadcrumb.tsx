import { motion } from 'framer-motion'
import { ChevronRight, Database } from 'lucide-react'
import type { BreadcrumbItem } from '../types'

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  totalCount: number
  isFiltered: boolean
}

/**
 * 面包屑导航 + 记录总数汇总
 * 步骤式可视化设计：节点 + 连接线
 */
export default function Breadcrumb({ items, totalCount, isFiltered }: BreadcrumbProps) {
  return (
    <motion.div
      className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 art-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 text-sm">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          const isClickable = !isLast && !!item.onClick
          return (
            <div key={idx} className="flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight size={14} className="text-textMuted/60" />
              )}
              {isClickable ? (
                <button
                  onClick={item.onClick}
                  className="px-2 py-1 rounded-md text-textSecondary hover:text-textPrimary hover:bg-surface transition-all duration-200 cursor-pointer text-xs font-medium"
                >
                  {item.label}
                </button>
              ) : isLast ? (
                <span className="px-2 py-1 rounded-md bg-surface text-textPrimary text-xs font-semibold">
                  {item.label}
                </span>
              ) : (
                <span className="px-2 py-1 text-textSecondary text-xs font-medium">
                  {item.label}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* 记录总数 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-xs text-textSecondary">
          <Database size={11} className="text-textMuted" />
          <span className="font-mono">{totalCount}</span>
          <span className="text-textMuted">条</span>
        </div>
        {isFiltered && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] bg-primary/10 text-primary font-medium">
            已筛选
          </span>
        )}
      </div>
    </motion.div>
  )
}
