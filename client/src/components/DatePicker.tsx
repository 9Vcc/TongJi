import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'

interface DatePickerProps {
  /** 完整日期 YYYY-MM-DD，空字符串表示未选择 */
  value: string
  /** 选择新日期时触发，回传完整日期 YYYY-MM-DD（allowClear 时可能回传空字符串） */
  onChange: (value: string) => void
  /** 最小可选日期（含），默认不限制 */
  minDate?: string
  /** 最大可选日期（含），默认今天 */
  maxDate?: string
  /** 是否占满父容器宽度 */
  fullWidth?: boolean
  /** 自定义按钮 className */
  buttonClassName?: string
  /** 占位提示文本 */
  placeholder?: string
  /** 是否允许清空（显示清除按钮），默认 false */
  allowClear?: boolean
  /** 是否在按钮中显示年份，默认 false（仅显示 X月X日） */
  showYear?: boolean
}

/**
 * 日期选择器（仅显示月日，不使用浏览器原生 date input）
 * - 按钮显示「X月X日」
 * - 弹出日历网格，支持月份切换
 * - 年份默认取 value 中的年份或当前年
 * - 支持最小/最大日期限制
 */
export default function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  fullWidth = false,
  buttonClassName,
  placeholder = '选择日期',
  allowClear = false,
  showYear = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 解析当前值
  const parsed = useMemo(() => {
    if (!value) return null
    const d = new Date(value + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return null
    return d
  }, [value])

  // 日历视图的年月（默认取 value 的年月或当前年月）
  const [viewYear, setViewYear] = useState(() => parsed?.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => parsed?.getMonth() ?? new Date().getMonth())

  // 打开弹窗时同步视图到 value 所在月
  useEffect(() => {
    if (open && parsed) {
      setViewYear(parsed.getFullYear())
      setViewMonth(parsed.getMonth())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // 最大日期默认今天
  const maxDateObj = useMemo(() => {
    if (maxDate) return new Date(maxDate + 'T00:00:00')
    return new Date()
  }, [maxDate])
  const minDateObj = useMemo(() => {
    if (minDate) return new Date(minDate + 'T00:00:00')
    return null
  }, [minDate])

  // 日历网格：当月天数 + 前后填充
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const startWeekday = firstDay.getDay() // 0=周日
    const daysInMonth = lastDay.getDate()
    const cells: (number | null)[] = []
    // 前置填充 null（对齐到周日开头）
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [viewYear, viewMonth])

  // 格式化显示文本
  const displayText = parsed
    ? showYear
      ? `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`
      : `${parsed.getMonth() + 1}月${parsed.getDate()}日`
    : placeholder

  // 清除日期
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // 检查某天是否可选
  const isDayDisabled = (day: number): boolean => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    if (minDateObj && d < minDateObj) return true
    if (d > maxDateObj) return true
    return false
  }

  // 选择日期
  const handleSelectDay = (day: number) => {
    if (isDayDisabled(day)) return
    const m = String(viewMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    onChange(`${viewYear}-${m}-${d}`)
    setOpen(false)
  }

  // 是否为选中日
  const isSelectedDay = (day: number): boolean => {
    if (!parsed) return false
    return (
      parsed.getFullYear() === viewYear &&
      parsed.getMonth() === viewMonth &&
      parsed.getDate() === day
    )
  }

  // 是否为今天
  const isToday = (day: number): boolean => {
    const today = new Date()
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  const defaultBtnClass =
    'flex items-center justify-between gap-2 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 cursor-pointer'

  return (
    <div
      className={`relative ${fullWidth ? 'w-full' : ''}`}
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${defaultBtnClass} ${buttonClassName ?? ''} ${fullWidth ? 'w-full' : ''}`}
      >
        <span className={`flex-1 min-w-0 truncate text-left ${!parsed ? 'text-textMuted' : ''}`}>
          {displayText}
        </span>
        {allowClear && parsed ? (
          <X
            size={14}
            className="flex-shrink-0 text-textMuted hover:text-danger transition-colors duration-200"
            onClick={handleClear}
          />
        ) : (
          <Calendar size={14} className="flex-shrink-0 text-textMuted" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top' }}
            className="absolute z-50 mt-1 w-64 bg-card border border-border rounded-custom-sm shadow-lg"
          >
            {/* 月份导航 */}
            <div className="flex items-center justify-between px-2 py-2 border-b border-border">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-textPrimary select-none">
                {viewYear}年 {viewMonth + 1}月
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {/* 星期表头 */}
            <div className="grid grid-cols-7 gap-0.5 px-2 pt-2">
              {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
                <div
                  key={w}
                  className="text-center text-[10px] font-medium text-textMuted py-1 select-none"
                >
                  {w}
                </div>
              ))}
            </div>
            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-0.5 p-2">
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={idx} className="aspect-square" />
                }
                const disabled = isDayDisabled(day)
                const selected = isSelectedDay(day)
                const today = isToday(day)
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    disabled={disabled}
                    className={`aspect-square flex items-center justify-center text-xs rounded transition-colors duration-100 cursor-pointer relative ${
                      selected
                        ? 'bg-primary text-white font-medium'
                        : disabled
                          ? 'text-textMuted/50 cursor-not-allowed'
                          : today
                            ? 'text-primary hover:bg-primary/10 font-medium'
                            : 'text-textPrimary hover:bg-surface'
                    }`}
                  >
                    {day}
                    {today && !selected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
