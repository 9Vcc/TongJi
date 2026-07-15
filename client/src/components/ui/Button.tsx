import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'

/**
 * 按钮组件（参考 art-design-pro ElButton 风格）
 * - variant: 视觉变体
 * - size: 尺寸
 * - loading: 加载态（显示 spinner，禁用点击）
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'ghost'
  | 'outline'

export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  block?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover active:bg-primary-hover shadow-sm shadow-primary/20',
  secondary:
    'bg-g-200 text-textPrimary hover:bg-g-300 dark:text-white dark:hover:bg-g-400',
  danger:
    'bg-danger text-white hover:opacity-90 active:opacity-90 shadow-sm shadow-danger/20',
  success:
    'bg-success text-white hover:opacity-90 active:opacity-90 shadow-sm shadow-success/20',
  warning:
    'bg-warning text-white hover:opacity-90 active:opacity-90 shadow-sm shadow-warning/20',
  ghost:
    'bg-transparent text-textSecondary hover:bg-g-200 hover:text-textPrimary dark:hover:bg-g-300',
  outline:
    'bg-transparent border border-border text-textPrimary hover:border-primary hover:text-primary hover:bg-primary/5',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-9 px-4 text-sm gap-1.5',
  lg: 'h-11 px-6 text-base gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      block = false,
      icon,
      iconRight,
      children,
      className = '',
      disabled,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`btn-press inline-flex items-center justify-center rounded-custom-sm font-medium select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
          VARIANT_CLASSES[variant]
        } ${SIZE_CLASSES[size]} ${block ? 'w-full' : ''} ${
          isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
        } ${className}`}
        {...rest}
      >
        {loading && (
          <svg
            className="animate-spin w-4 h-4 -ml-0.5"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {!loading && icon}
        {children && <span>{children}</span>}
        {!loading && iconRight}
      </button>
    )
  },
)

Button.displayName = 'Button'
export default Button
