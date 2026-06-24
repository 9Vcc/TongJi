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
