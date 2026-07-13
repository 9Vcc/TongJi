import type { FastifyRequest, FastifyReply } from 'fastify'
import { LRUCache } from 'lru-cache'
import { Role } from '../../generated/prisma/client'
import { verifyToken } from '../utils/jwt'
import prisma from '../lib/prisma'

/**
 * 超管授权厅 LRU 缓存
 * key: accountId
 * value: branchIds 数组（主厅 + 额外授权厅）
 * TTL 60s 平衡时效性与 DB 压力；max 1000 足以容纳所有账户
 */
const branchIdsCache = new LRUCache<number, number[]>({
  max: 1000,
  ttl: 60_000,
})

/**
 * 失效指定账户的授权厅缓存
 * 在账户状态变更、删除、修改授权厅等场景调用
 */
export function invalidateAuthCache(accountId: number): void {
  branchIdsCache.delete(accountId)
}

/**
 * 认证中间件：验证 JWT，将用户信息挂载到 request.user
 * 超管的 branchIds 优先从 LRU 缓存读取，未命中再查 DB 并写入缓存
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未提供认证令牌' })
  }

  const token = authHeader.substring(7)
  try {
    const payload = verifyToken(token)
    // 超管：从数据库加载所有授权厅（主厅 + AccountBranch 额外授权厅）
    let branchIds: number[] = []
    if (payload.role === Role.CHAOGUAN && payload.branchId !== null) {
      const cached = branchIdsCache.get(payload.id)
      if (cached !== undefined) {
        branchIds = cached
      } else {
        const extra = await prisma.accountBranch.findMany({
          where: { accountId: payload.id },
          select: { branchId: true },
        })
        branchIds = [
          payload.branchId,
          ...extra.map((ab) => ab.branchId),
        ]
        branchIdsCache.set(payload.id, branchIds)
      }
    }
    request.user = { ...payload, branchIds }
  } catch {
    return reply.code(401).send({ error: '无效或过期的认证令牌' })
  }
}

/**
 * 检查用户是否有权操作指定厅
 * 会长：所有厅
 * 超管：主厅 + AccountBranch 授权厅（branchIds）
 * 管理：仅主厅（branchId）
 */
export function canAccessBranch(
  user: { role: Role; branchId: number | null; branchIds: number[] },
  branchId: number
): boolean {
  if (user.role === Role.HUIZHANG) return true
  if (user.role === Role.CHAOGUAN) return user.branchIds.includes(branchId)
  return user.branchId === branchId
}

/**
 * 获取用户可访问的所有厅 ID 列表
 * 会长：返回 null（表示全部厅）
 * 超管：返回 branchIds
 * 管理：返回 [branchId]（或空数组）
 */
export function getAccessibleBranchIds(
  user: { role: Role; branchId: number | null; branchIds: number[] }
): number[] | null {
  if (user.role === Role.HUIZHANG) return null
  if (user.role === Role.CHAOGUAN) return user.branchIds
  return user.branchId !== null ? [user.branchId] : []
}

/**
 * 角色等级映射：会长(3) > 超管(2) > 管理(1)
 * 上级自动拥有下级所有权限
 */
const ROLE_LEVEL: Record<Role, number> = {
  HUIZHANG: 3,
  CHAOGUAN: 2,
  GUANLI: 1,
}

/**
 * 角色校验中间件工厂
 * 基于角色层级：用户角色等级 >= 所需最低角色等级即放行
 * - requireRole(Role.GUANLI)：管理及以上（管理、超管、会长）均可访问
 * - requireRole(Role.CHAOGUAN)：超管及以上（超管、会长）均可访问
 * - requireRole(Role.HUIZHANG)：仅会长可访问
 */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: '未认证' })
    }

    // 未指定角色时，默认允许所有已认证用户（管理级别即可）
    if (roles.length === 0) return

    // 取所需角色中的最低等级作为门槛
    const requiredLevel = Math.min(...roles.map((r) => ROLE_LEVEL[r]))
    const userLevel = ROLE_LEVEL[request.user.role]

    if (userLevel < requiredLevel) {
      return reply.code(403).send({ error: '权限不足' })
    }
  }
}
