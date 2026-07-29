import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemLabel?: string
  onPageChange: (page: number) => void
}

/**
 * 通用分页控件
 * 现代化设计：圆角按钮、悬停高亮、禁用态淡出
 */
export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemLabel = '条',
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const handlePrev = () => onPageChange(Math.max(1, currentPage - 1))
  const handleNext = () => onPageChange(Math.min(totalPages, currentPage + 1))

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-t border-border bg-surface/30">
      <div className="flex items-center gap-3">
        <span className="text-xs text-textMuted">
          共 <span className="font-mono text-textPrimary font-medium">{totalItems}</span> {itemLabel}
        </span>
        <div className="h-3 w-px bg-border" />
        <span className="text-xs text-textMuted">
          第 <span className="font-mono text-textPrimary font-medium">{currentPage}</span>
          /<span className="font-mono text-textMuted">{totalPages}</span> 页
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handlePrev}
          disabled={currentPage <= 1}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-textSecondary hover:text-textPrimary hover:bg-surface rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer border border-border"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">上一页</span>
        </button>

        {/* 页码指示 */}
        <div className="flex items-center gap-1 px-2">
          {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
            let pageNum: number
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (currentPage <= 4) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = currentPage - 3 + i
            }
            const isCurrent = pageNum === currentPage
            return (
              <button
                key={i}
                onClick={() => onPageChange(pageNum)}
                className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer ${
                  isCurrent
                    ? 'bg-primary text-white font-semibold'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-surface'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>

        <button
          onClick={handleNext}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-textSecondary hover:text-textPrimary hover:bg-surface rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer border border-border"
        >
          <span className="hidden sm:inline">下一页</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
