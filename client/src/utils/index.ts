import { pinyin } from 'pinyin-pro'
import type { NamingItem } from '../types'

/**
 * 获取本周一 00:00:00 作为周起始时间
 */
export function getWeekStart(date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = 周日, 1 = 周一, ...
  const diff = day === 0 ? -6 : 1 - day // 距周一的天数
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 获取月统计厅的月初1日（00:00:00）
 */
export function getMonthStart(date = new Date()): Date {
  const r = new Date(date.getFullYear(), date.getMonth(), 1)
  r.setHours(0, 0, 0, 0)
  return r
}

/**
 * Top3 排名徽章颜色（金/银/铜）
 */
export const rankBadgeColors = ['#F59E0B', '#94A3B8', '#CD7F32']

/**
 * Top3 排名行背景色（金/银/铜）
 */
export const rankRowBg = [
  'bg-yellow-50 dark:bg-yellow-900/20',
  'bg-slate-50 dark:bg-slate-700/30',
  'bg-orange-50 dark:bg-orange-900/20',
]

/**
 * 冠名展示格式：如 "周冠×2 月冠×1"，无则返回 '-'
 */
export function formatNamings(namings?: NamingItem[]): string {
  if (!namings || namings.length === 0) return '-'
  return (
    namings
      .filter((n) => n.count > 0)
      .map((n) => `${n.levelName}×${n.count}`)
      .join(' ') || '-'
  )
}

/**
 * 获取指定周前一周的周一日期
 */
export function getPreviousWeekStart(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() - 7)
  return getWeekStart(d)
}

/**
 * 获取指定周后一周的周一日期
 */
export function getNextWeekStart(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return getWeekStart(d)
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm
 */
export function formatDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

/**
 * 获取周范围显示文本（如 2026-06-22 ~ 2026-06-28）
 */
export function getWeekRangeText(weekStart: Date | string): string {
  const start = typeof weekStart === 'string' ? new Date(weekStart) : weekStart
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${formatDate(start)} ~ ${formatDate(end)}`
}

/**
 * 获取月份范围显示文本（如 2026-06-01 ~ 2026-06-30）
 */
export function getMonthRangeText(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${formatDate(start)} ~ ${formatDate(end)}`
}

/**
 * 角色显示文本
 */
export function getRoleText(role: string): string {
  const map: Record<string, string> = {
    HUIZHANG: '会长',
    CHAOGUAN: '超管',
    GUANLI: '管理',
  }
  return map[role] || role
}

/**
 * 姓名拼音缓存：避免对同一姓名重复计算
 */
const pinyinCache = new Map<string, { full: string; initial: string }>()

/**
 * 计算姓名的完整拼音和首字母（结果缓存）
 * - full: 如 "张三" → "zhangsan"
 * - initial: 如 "张三" → "zs"
 */
function getPinyinKeys(name: string): { full: string; initial: string } {
  const cached = pinyinCache.get(name)
  if (cached) return cached
  const full = pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase()
  const initial = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase()
  const result = { full, initial }
  pinyinCache.set(name, result)
  return result
}

/**
 * 姓名模糊匹配：支持中文、拼音（全拼）、拼音首字母
 * 例如姓名"张三"可被 "张"、"张三"、"zhang"、"zhangsan"、"zs"、"zhangs" 匹配
 * @param name 人员姓名
 * @param term 搜索词（已 trim）
 */
export function matchNamePinyin(name: string, term: string): boolean {
  if (!term) return true
  if (!name) return false
  const lowerName = name.toLowerCase()
  const lowerTerm = term.toLowerCase()
  // 1. 中文原值匹配
  if (lowerName.includes(lowerTerm)) return true
  // 2. 拼音匹配（全拼 + 首字母）
  const { full, initial } = getPinyinKeys(name)
  if (full.includes(lowerTerm)) return true
  if (initial.includes(lowerTerm)) return true
  return false
}
