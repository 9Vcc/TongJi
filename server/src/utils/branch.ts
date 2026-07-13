import { Role } from '../../generated/prisma/client'
import { canAccessBranch } from '../middleware/auth'

/**
 * 解析查询参数中的分部过滤
 * 会长可指定 branchId 或查看全部；超管可查看指定授权厅或全部授权厅；管理只能查看自己分部
 */
export function resolveQueryBranchId(
  currentUser: { role: Role; branchId: number | null; branchIds: number[] },
  requestedBranchId: string | undefined
): number | undefined {
  if (currentUser.role === Role.HUIZHANG) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      return Number.isNaN(n) ? undefined : n
    }
    return undefined
  }
  // 超管：可查看指定授权厅
  if (currentUser.role === Role.CHAOGUAN) {
    if (requestedBranchId) {
      const n = Number(requestedBranchId)
      if (!Number.isNaN(n) && canAccessBranch(currentUser, n)) {
        return n
      }
    }
    return undefined
  }
  return currentUser.branchId ?? undefined
}
