import { StatCycle } from '../../generated/prisma/client'
import { getWeekStart } from './week'

/**
 * 获取指定日期所在月的1号 00:00:00
 */
export function getMonthStart(date = new Date()): Date {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 获取指定日期所在月的下月1号 00:00:00（用于范围查询的上界，不含）
 */
export function getMonthEnd(date = new Date()): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 获取指定日期上个月1号 00:00:00
 */
export function getPreviousMonthStart(date = new Date()): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() - 1)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 根据统计周期获取周期起始日
 * - WEEK: 所在周周一
 * - MONTH: 所在月1号
 */
export function getPeriodStart(cycle: StatCycle, date = new Date()): Date {
  return cycle === StatCycle.MONTH ? getMonthStart(date) : getWeekStart(date)
}

/**
 * 根据统计周期获取周期结束日（范围查询上界，不含）
 * - WEEK: 下周一
 * - MONTH: 下月1号
 */
export function getPeriodEnd(cycle: StatCycle, date = new Date()): Date {
  if (cycle === StatCycle.MONTH) return getMonthEnd(date)
  const d = new Date(date)
  d.setDate(d.getDate() + 7)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 获取上一个周期的起始日
 * - WEEK: 上周一
 * - MONTH: 上月1号
 */
export function getPreviousPeriodStart(cycle: StatCycle, date = new Date()): Date {
  if (cycle === StatCycle.MONTH) return getPreviousMonthStart(date)
  const d = new Date(date)
  d.setDate(d.getDate() - 7)
  return getWeekStart(d)
}
