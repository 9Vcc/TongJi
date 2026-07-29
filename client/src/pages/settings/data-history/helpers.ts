import { getWeekRangeText, getMonthRangeText } from '../../../utils'
import type { DataLogItem } from '../../../types'
import { FIELD_LABELS } from './config'
import type { FieldKey } from './types'

/**
 * 判断 weekStart 是否为月初1日（月统计厅的数据归属日）
 */
export function isMonthStart(weekStart: string): boolean {
  const d = new Date(weekStart)
  return d.getDate() === 1
}

/**
 * 格式化所属周期：月统计厅显示月份，周统计厅显示周次
 */
export function formatPeriod(weekStart: string): string {
  if (isMonthStart(weekStart)) {
    return getMonthRangeText(weekStart)
  }
  return getWeekRangeText(weekStart)
}

/**
 * 从一条 log 中提取涉及的字段列表
 * - create：字段值非 0 的字段
 * - delete：oldValue 中存在的字段
 * - update：before/after 差异的字段
 */
export function getLogFields(log: DataLogItem): FieldKey[] {
  const result: FieldKey[] = []
  if (log.type === 'create') {
    for (const f of FIELD_LABELS) {
      if (log[f.key] !== undefined && log[f.key] !== 0) result.push(f.key)
    }
  } else if (log.type === 'delete') {
    const parsed = parseValues(log.oldValue)
    for (const f of FIELD_LABELS) {
      if (parsed[f.key] !== undefined) result.push(f.key)
    }
  } else {
    // update
    const before = log.before
    const after = log.after
    if (before && after) {
      for (const f of FIELD_LABELS) {
        if (before[f.key] !== after[f.key]) result.push(f.key)
      }
    } else {
      // 兼容旧数据
      const oldParsed = parseValues(log.oldValue)
      const newParsed = parseValues(log.newValue)
      for (const f of FIELD_LABELS) {
        if (oldParsed[f.key] !== newParsed[f.key]) result.push(f.key)
      }
    }
  }
  return result
}

/**
 * 解析 JSON 字符串为结构化数值对象
 */
function parseValues(str: string | null | undefined): { sg?: number; mx?: number; qm?: number; zcDays?: number } {
  if (!str) return {}
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}

/**
 * 格式化时段显示文本
 */
export function formatSlot(slotIndex: number): string {
  return `${slotIndex * 2}-${slotIndex * 2 + 2}`
}

/**
 * 计算分页总页数
 */
export function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

/**
 * 获取安全页码（不超过总页数，不小于 1）
 */
export function getSafePage(currentPage: number, totalPages: number): number {
  return Math.min(currentPage, totalPages)
}

/**
 * 分页切片
 */
export function paginate<T>(list: T[], page: number, pageSize: number): T[] {
  return list.slice((page - 1) * pageSize, page * pageSize)
}
