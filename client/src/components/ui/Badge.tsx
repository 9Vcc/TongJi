import { type ReactNode } from 'react'

/**
 * 徽章组件（参考 art-design-pro ElTag 风格）
 * 用于状态标记、数量提示、分类标签等
 */
export type BadgeVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  /** 实心（填充背景）或 轻量（浅色背景 + 同色文字） */
  solid?: boolean
  children: ReactNode
  className?: string
  /** 圆点模式（仅显示一个色点 + 文字） */
  dot?: boolean
}

const VARIANT_SOLID: Record<BadgeVariant, string> = {
  primary: 'bg-primary text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  info: 'bg-info text-white',
  neutral: 'bg-g-400 text-white dark:text-g-900',
}

const VARIANT_LIGHT: Record<BadgeVariant, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  neutral: 'bg-g-200 text-textSecondary dark:text-g-700',
}

const DOT_COLOR: Record<BadgeVariant, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-g-400',
}

export default function Badge({
  variant = 'neutral',
  solid = false,
  dot = false,
  children,
  className = '',
}: BadgeProps) {
  if (dot) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[variant]}`}
          aria-hidden="true"
        />
        {children}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-custom-xs ${
        solid ? VARIANT_SOLID[variant] : VARIANT_LIGHT[variant]
      } ${className}`}
    >
      {children}
    </span>
  )
}
