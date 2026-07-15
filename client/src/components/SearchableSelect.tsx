import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  renderOption?: (option: Option) => ReactNode
}

/**
 * 搜索选择框：
 * - 始终显示输入框，聚焦时下方浮动显示全部选项
 * - 输入即过滤，匹配项高亮
 * - 键盘导航：↑↓ 选择、Enter 确认、Esc 关闭
 * - 选中后输入框回显选中项 label
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '搜索...',
  emptyText = '无匹配项',
  disabled = false,
  renderOption,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // 键盘导航高亮索引（-1 表示未高亮）
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const selectedLabel = selectedOption?.label ?? ''
  // 输入框显示：open 时有输入显示输入内容，否则回显选中项 label
  const displayText = open && query !== '' ? query : selectedLabel

  const filtered =
    query.trim() === ''
      ? options
      : options.filter((o) =>
          o.label.toLowerCase().includes(query.trim().toLowerCase())
        )

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
    const selectedIndex = filtered.findIndex((o) => o.value === value)
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
    setQuery('')
    setActiveIndex(-1)
  }

  const handleSelect = (val: string) => {
    onChange(val)
    closeDropdown()
    inputRef.current?.blur()
  }

  const handleInputChange = (v: string) => {
    setQuery(v)
    setOpen(true)
    setActiveIndex(v.trim() === '' ? -1 : 0)
    // 清空输入时同步清除选中项
    if (v.trim() === '') {
      onChange('')
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onChange('')
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (filtered.length > 0) {
        setActiveIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (filtered.length > 0) {
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1
        )
      }
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault()
        handleSelect(filtered[activeIndex].value)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        closeDropdown()
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none z-10"
        />
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pl-8 pr-8 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-surface disabled:cursor-not-allowed transition-colors duration-200"
        />
        {/* 右侧按钮：清除 或 展开箭头 */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          {(query !== '' || value !== '') && !disabled ? (
            <button
              type="button"
              onClick={handleClear}
              onMouseDown={(e) => e.preventDefault()}
              className="p-0.5 text-textMuted hover:text-textPrimary transition-colors duration-200"
              title="清除"
            >
              <X size={14} />
            </button>
          ) : !disabled ? (
            <ChevronDown
              size={14}
              className="text-textMuted pointer-events-none"
            />
          ) : null}
        </div>
      </div>

      {/* 下拉列表：聚焦或输入时显示，文字完整显示不被容器截断 */}
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg">
          <div ref={listRef} className="max-h-56 overflow-y-auto scrollbar-thin p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-textMuted">
                {emptyText}
              </div>
            ) : (
              filtered.map((opt, idx) => (
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
