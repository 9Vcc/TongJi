import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'

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
 * 直接可见的搜索选择框：
 * - 始终显示输入框，输入即过滤
 * - 聚焦/输入时下方浮动显示过滤结果
 * - 点击结果项选中；选中后输入框显示 label
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
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 选中项对应的 label，用于在未输入时回显选中内容
  const selectedOption = options.find((o) => o.value === value)
  const selectedLabel = selectedOption?.label ?? ''
  // 输入框显示：有输入显示输入内容，否则回显选中项 label
  const displayText = query !== '' ? query : selectedLabel

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered =
    query.trim() === ''
      ? options
      : options.filter((o) =>
          o.label.toLowerCase().includes(query.trim().toLowerCase())
        )

  const handleSelect = (val: string) => {
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  const handleInputChange = (v: string) => {
    setQuery(v)
    // 用户清空输入时，同步清除选中项
    if (v.trim() === '') {
      onChange('')
      setOpen(false)
    } else {
      setOpen(true)
    }
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pl-8 pr-8 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-surface disabled:cursor-not-allowed transition-colors duration-200"
        />
        {/* 清除按钮：有输入或已选中时显示 */}
        {(query !== '' || value !== '') && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition-colors duration-200"
            title="清除"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 仅在有输入时显示过滤结果，无输入不显示任何列表 */}
      {open && !disabled && query.trim() !== '' && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-textMuted">
                {emptyText}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150 cursor-pointer ${
                    opt.value === value
                      ? 'text-primary bg-primary/10'
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
