import type { FastifyRequest, FastifyReply } from 'fastify'
import { Role } from '../../generated/prisma/client'
import { verifyToken } from '../utils/jwt'

/**
 * 认证中间件：验证 JWT，将用户信息挂载到 request.user
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未提供认证令牌' })
  }

  const token = authHeader.substring(7)
  try {
    const payload = verifyToken(token)
    request.user = payload
  } catch {
    return reply.code(401).send({ error: '无效或过期的认证令牌' })
  }
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

    // 取所需角色中的最低等级作为门槛
    const requiredLevel = Math.min(...roles.map((r) => ROLE_LEVEL[r]))
    const userLevel = ROLE_LEVEL[request.user.role]

    if (userLevel < requiredLevel) {
      return reply.code(403).send({ error: '权限不足' })
    }
  }
}
