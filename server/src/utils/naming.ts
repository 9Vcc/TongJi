import prisma from '../lib/prisma'
import { StatCycle } from '../../generated/prisma/client'

interface NamingLevelLike {
  id: number
  threshold: number
}

interface NamingConversion {
  levelId: number
  count: number
}

/**
 * 按收光值转换为冠名（逐级扣减，高等级优先）
 * 等级按 threshold 降序排列，依次整除取商，余数进入下一级
 * 如：周冠=5，月冠=20，收光=27 → 1月冠 + 1周冠 + 2收光
 */
export function convertNaming(
  sgValue: number,
  levels: NamingLevelLike[]
): { namings: NamingConversion[]; remainingSg: number } {
  // 按 threshold 降序排列（高等级优先扣减），id 升序作为稳定排序兜底
  const sorted = [...levels].sort((a, b) => {
    if (b.threshold !== a.threshold) return b.threshold - a.threshold
    return a.id - b.id
  })
  let remaining = Math.max(0, Math.floor(sgValue))
  const namings: NamingConversion[] = []
  for (const level of sorted) {
    if (level.threshold <= 0) continue
    const count = Math.floor(remaining / level.threshold)
    if (count > 0) {
      namings.push({ levelId: level.id, count })
      remaining = remaining % level.threshold
    }
  }
  return { namings, remainingSg: remaining }
}

/**
 * 获取某厅的冠名等级（仅按月统计的厅才有意义，但此处不限制，由调用方判断）
 */
export async function getBranchNamingLevels(branchId: number) {
  return prisma.namingLevel.findMany({
    where: { branchId },
    orderBy: [{ threshold: 'desc' }, { id: 'asc' }],
  })
}

/**
 * 判断某厅是否启用冠名（按月统计且有冠名等级）
 */
export async function isNamingEnabled(branchId: number): Promise<boolean> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { statCycle: true, _count: { select: { namingLevels: true } } },
  })
  if (!branch) return false
  return branch.statCycle === StatCycle.MONTH && branch._count.namingLevels > 0
}

/**
 * 计算冠名福利总额（各等级冠名数 × 对应等级福利）
 */
export function computeNamingWelfare(
  namings: { levelId: number; count: number }[],
  levels: Map<number, number> // levelId -> reward
): number {
  return namings.reduce((sum, n) => sum + n.count * (levels.get(n.levelId) ?? 0), 0)
}
