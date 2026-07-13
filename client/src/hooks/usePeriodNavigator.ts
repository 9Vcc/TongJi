import { useMemo, useState } from 'react'
import type { Branch } from '../types'
import {
  formatDate,
  getWeekStart,
  getPreviousWeekStart,
  getMonthStart,
} from '../utils'

export interface UsePeriodNavigatorOptions {
  /** 当前所选厅（含 statCycle），未选厅传 undefined/null */
  branch?: Pick<Branch, 'statCycle'> | null
  /** 可用周列表（从 API 获取的原始 YYYY-MM-DD 列表） */
  availableWeeks?: string[]
  /** 初始 weekStart，不传则按周期自动取本周周一或本月1日 */
  initialWeekStart?: Date
}

export interface UsePeriodNavigatorResult {
  weekStart: Date
  setWeekStart: (d: Date) => void
  handlePrev: () => void
  handleNext: () => void
  handleThisPeriod: () => void
  /** 合并历史周次与当前周、当前所选周后的可用周列表（降序） */
  availableWeeks: string[]
  /** 从可用周次提取的不重复月份列表（降序） */
  availableMonths: { key: string; ref: string }[]
  /** 当前选中月份的参考日（YYYY-MM-DD），用于月份下拉选择 */
  selectedMonthRef: string
  /** 是否按月统计 */
  isMonthCycle: boolean
}

/**
 * 日期导航 Hook：统一 Dashboard / DataEntry / PublicRanking / Ranking 的
 * 周期（按周/按月）日期导航逻辑
 *
 * - 周统计厅：weekStart 始终为周一；上一周/下一周/本周通过 getWeekStart 系列函数计算
 * - 月统计厅：weekStart 始终为月初1日；上一月/下一月/本月通过 setMonth 切换并归一到月初
 *
 * 父组件如需在厅切换（周期变化）时重置 weekStart，应自行用 effect 监听
 * isMonthCycle/branch 变化后调用 setWeekStart，本 Hook 不自动重置以避免覆盖父组件逻辑。
 */
export function usePeriodNavigator(
  options: UsePeriodNavigatorOptions = {},
): UsePeriodNavigatorResult {
  const {
    branch,
    availableWeeks: rawWeeks = [],
    initialWeekStart,
  } = options
  const isMonthCycle = (branch?.statCycle ?? 'WEEK') === 'MONTH'

  const [weekStart, setWeekStart] = useState<Date>(
    () =>
      initialWeekStart ??
      (isMonthCycle ? getMonthStart(new Date()) : getWeekStart()),
  )

  const handlePrev = () => {
    if (isMonthCycle) {
      const d = new Date(weekStart)
      d.setMonth(d.getMonth() - 1)
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      setWeekStart(d)
    } else {
      setWeekStart(getPreviousWeekStart(weekStart))
    }
  }

  const handleNext = () => {
    if (isMonthCycle) {
      const d = new Date(weekStart)
      d.setMonth(d.getMonth() + 1)
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      const thisMonthStart = getMonthStart(new Date())
      if (d <= thisMonthStart) setWeekStart(d)
    } else {
      const next = new Date(weekStart)
      next.setDate(next.getDate() + 7)
      if (next <= getWeekStart()) setWeekStart(next)
    }
  }

  const handleThisPeriod = () => {
    setWeekStart(isMonthCycle ? getMonthStart(new Date()) : getWeekStart())
  }

  // 合并历史周次与本周、当前所选周（去重，降序）
  const availableWeeks = useMemo(() => {
    const set = new Set<string>()
    rawWeeks.forEach((w) => set.add(formatDate(new Date(w))))
    set.add(formatDate(getWeekStart()))
    set.add(formatDate(weekStart))
    return Array.from(set).sort().reverse()
  }, [rawWeeks, weekStart])

  // 按月统计时：从周列表提取不重复月份（每月取最早出现的日期作为参考日）
  const availableMonths = useMemo(() => {
    const monthMap = new Map<string, string>()
    const addMonth = (dateStr: string) => {
      const formatted = formatDate(new Date(dateStr))
      const d = new Date(formatted)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap.has(key)) monthMap.set(key, formatted)
    }
    rawWeeks.forEach(addMonth)
    addMonth(formatDate(new Date()))
    addMonth(formatDate(weekStart))
    return Array.from(monthMap.entries())
      .map(([key, ref]) => ({ key, ref }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [rawWeeks, weekStart])

  const selectedMonthRef = useMemo(() => {
    const d = new Date(weekStart)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return (
      availableMonths.find((m) => m.key === key)?.ref ?? formatDate(weekStart)
    )
  }, [weekStart, availableMonths])

  return {
    weekStart,
    setWeekStart,
    handlePrev,
    handleNext,
    handleThisPeriod,
    availableWeeks,
    availableMonths,
    selectedMonthRef,
    isMonthCycle,
  }
}
