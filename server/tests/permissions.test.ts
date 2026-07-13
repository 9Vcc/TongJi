import { describe, it, expect } from 'vitest'
import { canAccessBranch, getAccessibleBranchIds } from '../src/middleware/auth'
import { Role } from '../generated/prisma/client'

/**
 * 权限校验纯函数测试
 *
 * 注意：任务描述中提到这两个函数位于 server/src/middleware/branch.ts，
 * 但实际代码中 canAccessBranch 与 getAccessibleBranchIds 定义在 server/src/middleware/auth.ts，
 * branch.ts 仅包含 requireBranchAccess 中间件。本测试从 auth.ts 导入。
 *
 * 这两个纯函数是 Task 6「权限绕过修复」的核心：
 * - canAccessBranch：校验用户能否操作指定厅，防止超管/管理越权访问他厅数据
 * - getAccessibleBranchIds：返回用户可访问的厅 ID 列表，用于查询过滤
 */

// 构造不同角色用户的辅助工厂
const huizhang = (branchId: number | null = 1, branchIds: number[] = []) => ({
  role: Role.HUIZHANG,
  branchId,
  branchIds,
})

const chaoguan = (branchId: number | null = 1, branchIds: number[] = [1]) => ({
  role: Role.CHAOGUAN,
  branchId,
  branchIds,
})

const guanli = (branchId: number | null = 1, branchIds: number[] = []) => ({
  role: Role.GUANLI,
  branchId,
  branchIds,
})

describe('canAccessBranch 权限校验', () => {
  describe('会长（HUIZHANG）', () => {
    it('会长访问任意厅均返回 true（不受分部限制）', () => {
      // 会长主厅为 1，访问厅 999 也应放行
      expect(canAccessBranch(huizhang(1), 999)).toBe(true)
      // 会长访问主厅
      expect(canAccessBranch(huizhang(1), 1)).toBe(true)
      // 会长未关联分部时仍可访问任意厅
      expect(canAccessBranch(huizhang(null), 5)).toBe(true)
    })
  })

  describe('超管（CHAOGUAN）', () => {
    it('超管访问主厅返回 true', () => {
      // 主厅为 1，授权厅列表包含主厅
      expect(canAccessBranch(chaoguan(1, [1]), 1)).toBe(true)
    })

    it('超管访问额外授权厅返回 true', () => {
      // 主厅为 1，额外授权厅 2、3
      expect(canAccessBranch(chaoguan(1, [1, 2, 3]), 2)).toBe(true)
      expect(canAccessBranch(chaoguan(1, [1, 2, 3]), 3)).toBe(true)
    })

    it('超管访问非授权厅返回 false（核心防越权场景）', () => {
      // 主厅为 1，仅授权 1、2，访问厅 3 应拒绝
      expect(canAccessBranch(chaoguan(1, [1, 2]), 3)).toBe(false)
      // 访问不存在的厅
      expect(canAccessBranch(chaoguan(1, [1, 2]), 999)).toBe(false)
    })

    it('超管 branchIds 不含主厅时访问主厅返回 false（防御性场景）', () => {
      // 异常数据：主厅为 1 但 branchIds 不含 1，访问主厅应拒绝
      // 这验证了 includes 判断而非 branchId 判断，确保一致性
      expect(canAccessBranch(chaoguan(1, [2, 3]), 1)).toBe(false)
    })
  })

  describe('管理（GUANLI）', () => {
    it('管理访问本厅返回 true', () => {
      expect(canAccessBranch(guanli(1), 1)).toBe(true)
    })

    it('管理访问他厅返回 false（核心防越权场景）', () => {
      expect(canAccessBranch(guanli(1), 2)).toBe(false)
      expect(canAccessBranch(guanli(1), 999)).toBe(false)
    })

    it('管理未关联分部时访问任意厅返回 false', () => {
      // branchId 为 null 时，null !== 任意数字，返回 false
      expect(canAccessBranch(guanli(null), 1)).toBe(false)
    })
  })
})

describe('getAccessibleBranchIds 可访问厅列表', () => {
  describe('会长（HUIZHANG）', () => {
    it('会长返回 null（表示全部厅，由调用方处理为不加过滤条件）', () => {
      expect(getAccessibleBranchIds(huizhang(1))).toBeNull()
      expect(getAccessibleBranchIds(huizhang(null))).toBeNull()
    })
  })

  describe('超管（CHAOGUAN）', () => {
    it('超管返回 [主厅, ...额外授权厅]', () => {
      // 主厅 1 + 额外授权厅 2、3
      const ids = getAccessibleBranchIds(chaoguan(1, [1, 2, 3]))
      expect(ids).toEqual([1, 2, 3])
    })

    it('超管仅授权主厅时返回 [主厅]', () => {
      const ids = getAccessibleBranchIds(chaoguan(1, [1]))
      expect(ids).toEqual([1])
    })

    it('超管 branchIds 为空数组时返回空数组', () => {
      const ids = getAccessibleBranchIds(chaoguan(1, []))
      expect(ids).toEqual([])
    })
  })

  describe('管理（GUANLI）', () => {
    it('管理返回 [本厅]', () => {
      expect(getAccessibleBranchIds(guanli(5))).toEqual([5])
    })

    it('管理未关联分部时返回空数组', () => {
      expect(getAccessibleBranchIds(guanli(null))).toEqual([])
    })
  })
})
