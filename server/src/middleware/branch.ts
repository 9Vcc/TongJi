import type { FastifyRequest, FastifyReply } from 'fastify'
import { Role } from '../../generated/prisma/client'

/**
 * 分部归属校验中间件
 * 校验超管/管理只能访问自己分部的数据
 * 会长不受此限制
 * 从 request.params 或 request.query 中获取 branchId，与 request.user.branchId 比较
 */
export async function requireBranchAccess(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: '未认证' })
  }

  // 会长不受此限制
  if (request.user.role === Role.HUIZHANG) {
    return
  }

  const params = request.params as Record<string, unknown> | undefined
  const query = request.query as Record<string, unknown> | undefined
  const rawBranchId = params?.branchId ?? query?.branchId

  if (rawBranchId === undefined || rawBranchId === null || rawBranchId === '') {
    // 没有提供 branchId，放行（由具体路由处理）
    return
  }

  const targetBranchId = Number(rawBranchId)
  if (Number.isNaN(targetBranchId)) {
    return reply.code(400).send({ error: '无效的分部ID' })
  }

  if (request.user.branchId === null || request.user.branchId !== targetBranchId) {
    return reply.code(403).send({ error: '无权访问该分部数据' })
  }
}
