import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

interface GroupedSelectProps {
  value: string
  onChange: (value: string) => void
  /** 扁平选项列表（无分组模式，与 groups 二选一） */
  options?: SelectOption[]
  /** 分组选项列表（分组模式，与 options 二选一） */
  groups?: SelectGroup[]
  /** 顶部可选项（不在任何分组内，如"选择厅"/"全部"） */
  topOption?: SelectOption
  placeholder?: string
  disabled?: boolean
  /** 自定义按钮 className（用于覆盖默认 padding/字号等） */
  buttonClassName?: string
  /** 最小宽度（px） */
  minWidth?: number
  /** 最大宽度（px），0 表示不限 */
  maxWidth?: number
  /** 是否占满父容器宽度（true 时忽略 minWidth/maxWidth） */
  fullWidth?: boolean
  /** 自定义渲染选项内容 */
  renderOption?: (option: SelectOption) => ReactNode
}

/**
 * 通用分组下拉选择器
 * - 支持 options（扁平）或 groups（分组）两种模式
 * - 按钮触发，点击展开下拉列表
 * - framer-motion 展开动画（淡入 + 下滑）
 * - 选项文字使用 break-words 完整显示不被截断
 * - 键盘导航：↑↓ 选择、Enter 确认、Esc 关闭
 * - 点击外部自动关闭
 */
export default function GroupedSelect({
  value,
  onChange,
  options,
  groups,
  topOption,
  placeholder = '请选择',
  disabled = false,
  buttonClassName,
  minWidth = 0,
  maxWidth = 0,
  fullWidth = false,
  renderOption,
}: GroupedSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 归一化：统一为 groups 结构
  const normalizedGroups: SelectGroup[] = groups
    ? groups
    : options
      ? [{ label: '', options }]
      : []

  // 扁平化所有选项用于键盘导航（topOption 在最前）
  const flatOptions: SelectOption[] = [
    ...(topOption ? [topOption] : []),
    ...normalizedGroups.flatMap((g) => g.options),
  ]

  const selectedOption = flatOptions.find((o) => o.value === value)
  const displayText = selectedOption?.label ?? placeholder

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // 打开时滚动到选中项
  useEffect(() => {
    if (!open || !listRef.current) return
    const selectedIndex = flatOptions.findIndex((o) => o.value === value)
    if (selectedIndex >= 0) {
      setActiveIndex(selectedIndex)
      const el = listRef.current.querySelector<HTMLElement>(
        `[data-index="${selectedIndex}"]`
      )
      el?.scrollIntoView({ block: 'nearest' })
    } else {
      setActiveIndex(-1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 键盘导航时滚动到当前高亮项
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const closeDropdown = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleSelect = (val: string) => {
    onChange(val)
    closeDropdown()
    buttonRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (flatOptions.length > 0) {
        setActiveIndex((prev) =>
          prev < flatOptions.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return
      if (flatOptions.length > 0) {
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : flatOptions.length - 1
        )
      }
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && activeIndex < flatOptions.length) {
        e.preventDefault()
        handleSelect(flatOptions[activeIndex].value)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        closeDropdown()
      }
    }
  }

  // 渲染单个选项按钮
  const renderOptionBtn = (opt: SelectOption, idx: number) => (
    <button
      key={opt.value}
      type="button"
      data-index={idx}
      onClick={() => handleSelect(opt.value)}
      onMouseEnter={() => setActiveIndex(idx)}
      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-100 cursor-pointer break-words ${
        idx === activeIndex
          ? 'bg-primary/10 text-primary'
          : opt.value === value
            ? 'text-primary'
            : 'text-textPrimary hover:bg-surface'
      }`}
    >
      {renderOption ? renderOption(opt) : opt.label}
    </button>
  )

  let optionIndex = 0

  // 按钮样式：未指定 minWidth 时给默认值，避免文字和图标挤在一块
  const effectiveMinWidth = fullWidth ? 0 : (minWidth > 0 ? minWidth : 120)
  const buttonStyle: React.CSSProperties = fullWidth
    ? {}
    : { minWidth: `${effectiveMinWidth}px`, maxWidth: maxWidth > 0 ? `${maxWidth}px` : undefined }

  const defaultBtnClass = 'flex items-center justify-between gap-2 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 cursor-pointer'

  return (
    <div className={`relative grouped-select-container ${fullWidth ? 'w-full' : ''}`} ref={containerRef}>      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        style={buttonStyle}
        className={`${defaultBtnClass} ${buttonClassName ?? ''} ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={`flex-1 min-w-0 truncate text-left ${!selectedOption ? 'text-textMuted' : ''}`}>
          {displayText}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-textMuted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top' }}
            className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg"
          >
            <div ref={listRef} className="max-h-64 overflow-y-auto scrollbar-thin p-1">
              {/* 顶部选项 */}
              {topOption && (
                <div className="mb-1">
                  {renderOptionBtn(topOption, optionIndex++)}
                </div>
              )}
              {/* 分组选项 */}
              {normalizedGroups.map((group) => {
                if (group.options.length === 0) return null
                const startIdx = optionIndex
                optionIndex += group.options.length
                // 无 label 的分组：不渲染分组标题
                if (!group.label) {
                  return (
                    <div key={group.label || 'flat'}>
                      {group.options.map((opt, i) =>
                        renderOptionBtn(opt, startIdx + i)
                      )}
                    </div>
                  )
                }
                return (
                  <div key={group.label} className="mb-1 last:mb-0">
                    <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-textMuted select-none">
                      {group.label}
                    </div>
                    {group.options.map((opt, i) =>
                      renderOptionBtn(opt, startIdx + i)
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
