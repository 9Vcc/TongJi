import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { pinyin } from 'pinyin-pro'

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
 * - 输入文本时才显示下拉列表（聚焦不展开）
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
  // 输入框显示：有输入内容时显示输入内容，否则回显选中项 label
  const displayText = query !== '' ? query : selectedLabel

  // 预计算每个选项的拼音信息：首字母（如 zs）+ 完整拼音（如 zhangsan）
  // 用于支持输入英文字母时按拼音首字母或完整拼音匹配中文姓名
  const pinyinIndex = useMemo(() => {
    return options.map((o) => {
      const first = pinyin(o.label, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, '')
      const full = pinyin(o.label, { toneType: 'none' }).replace(/\s+/g, '')
      return { option: o, first, full }
    })
  }, [options])

  const filtered =
    query.trim() === ''
      ? options
      : (() => {
          const q = query.trim().toLowerCase()
          return pinyinIndex
            .filter(({ option, first, full }) => {
              // 中文名字字符匹配 / 英文 label 匹配
              if (option.label.toLowerCase().includes(q)) return true
              // 拼音首字母匹配（如 zs → 张三）
              if (first.toLowerCase().includes(q)) return true
              // 完整拼音匹配（如 zhangsan → 张三）
              if (full.toLowerCase().includes(q)) return true
              return false
            })
            .map(({ option }) => option)
        })()

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
      setActiveIndex(0)
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
    // 仅在输入非空文本时展开下拉列表
    if (v.trim() === '') {
      setOpen(false)
      setActiveIndex(-1)
      // 清空输入时同步清除选中项
      onChange('')
    } else {
      setOpen(true)
      setActiveIndex(0)
    }
  }

  const handleFocus = () => {
    if (disabled) return
    // 聚焦时全选文本，方便重新输入覆盖；不自动展开下拉
    inputRef.current?.select()
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
      if (!open) return
      e.preventDefault()
      if (filtered.length > 0) {
        setActiveIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === 'ArrowUp') {
      if (!open) return
      e.preventDefault()
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
          onFocus={handleFocus}
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
