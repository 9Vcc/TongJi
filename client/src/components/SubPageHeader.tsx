import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface SubPageHeaderProps {
  title: string
  desc?: string
  children?: ReactNode
}

export default function SubPageHeader({ title, desc, children }: SubPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          to="/settings"
          className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          title="返回设置"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-textPrimary">{title}</h2>
          {desc && (
            <p className="text-sm text-textSecondary mt-0.5">{desc}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
