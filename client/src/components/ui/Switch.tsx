import { type ReactNode } from 'react'

/**
 * 开关组件（参考 art-design-pro ElSwitch 风格）
 * - checked: 是否开启
 * - onChange: 切换回调
 * - size: 尺寸
 * - disabled: 禁用
 * - label: 旁边的文字标签
 */
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  label?: ReactNode
  className?: string
}

const SIZE_TRACK = {
  sm: 'w-8 h-4',
  md: 'w-10 h-5',
}
const SIZE_THUMB = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
}
const SIZE_TRANSLATE = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
}

export default function Switch({
  checked,
  onChange,
  size = 'md',
  disabled = false,
  label,
  className = '',
}: SwitchProps) {
  const handleClick = () => {
    if (!disabled) onChange(!checked)
  }

  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      className={`relative inline-flex items-center rounded-full tad-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
        SIZE_TRACK[size]
      } ${checked ? 'bg-primary' : 'bg-g-300'} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span
        className={`absolute left-0.5 bg-white rounded-full shadow-sm tad-200 ${
          SIZE_THUMB[size]
        } ${checked ? SIZE_TRANSLATE[size] : 'translate-x-0'}`}
      />
    </button>
  )

  if (!label) return <span className={className}>{switchEl}</span>

  return (
    <label
      className={`inline-flex items-center gap-2 ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      {switchEl}
      <span className="text-sm text-textPrimary select-none">{label}</span>
    </label>
  )
}
