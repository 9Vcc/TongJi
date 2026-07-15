import { type HTMLAttributes, type ReactNode } from 'react'

/**
 * 卡片组件（参考 art-design-pro art-card 设计）
 * - 自动应用边框/阴影双模式（data-box-mode 驱动）
 * - 支持 header / body / footer 插槽组合
 * - hoverable: 鼠标悬浮微上浮
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否可悬浮（上浮 + 阴影） */
  hoverable?: boolean
  /** 内边距尺寸 */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children?: ReactNode
}

const PADDING_CLASSES = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
}

export default function Card({
  hoverable = false,
  padding = 'md',
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`art-card tad-200 ${
        hoverable ? 'card-hover cursor-pointer' : ''
      } ${PADDING_CLASSES[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

/** 卡片头部：标题 + 副标题 + 右侧操作区 */
interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  extra?: ReactNode
  className?: string
}

Card.Header = function CardHeader({
  title,
  subtitle,
  extra,
  className = '',
}: CardHeaderProps) {
  return (
    <div className={`flex-cb mb-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-textPrimary truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 text-sm text-textSecondary truncate">{subtitle}</p>
        )}
      </div>
      {extra && <div className="flex-c gap-2 flex-shrink-0">{extra}</div>}
    </div>
  )
}

/** 卡片底部：操作按钮区 */
Card.Footer = function CardFooter({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`mt-4 pt-4 border-t border-border flex-cb gap-2 ${className}`}
    >
      {children}
    </div>
  )
}
