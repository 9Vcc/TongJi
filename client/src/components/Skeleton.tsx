interface SkeletonProps {
  className?: string
}

/** 基础骨架块 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer rounded-md ${className}`}
      aria-hidden="true"
    />
  )
}

/** KPI 卡片骨架 */
export function KpiCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="w-10 h-10 rounded-lg" />
      </div>
    </div>
  )
}

/** 图表骨架 */
export function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className={`${height} w-full`} />
    </div>
  )
}

/** 表格行骨架 */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  )
}

/** Top3 卡片骨架 */
export function Top3Skeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border border-border rounded-lg p-4 flex items-center gap-3"
          >
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 表格骨架（含表头行） */
export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 加载旋转图标 */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
