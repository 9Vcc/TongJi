/**
 * 获取指定日期所在周的周一日期（时间设为 00:00:00）
 * 不传 date 则使用当前日期
 */
export function getWeekStart(date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = 周日, 1 = 周一, ...
  const diff = day === 0 ? -6 : 1 - day // 距周一的天数
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
