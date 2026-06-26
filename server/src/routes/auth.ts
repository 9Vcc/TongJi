import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { signToken } from '../utils/jwt'
import { comparePassword } from '../utils/password'
import { authenticate } from '../middleware/auth'
import type { JwtPayload } from '../types'

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login - 登录
  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string }

    if (!username || !password) {
      return reply.code(400).send({ error: '用户名和密码不能为空' })
    }

    const account = await prisma.account.findUnique({
      where: { username },
    })

    if (!account) {
      return reply.code(401).send({ error: '用户名或密码错误' })
    }

    if (account.status !== 'ACTIVE') {
      return reply.code(403).send({ error: '账户已被禁用' })
    }

    const valid = await comparePassword(password, account.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: '用户名或密码错误' })
    }

    const payload: JwtPayload = {
      id: account.id,
      username: account.username,
      role: account.role,
      branchId: account.branchId,
    }

    const token = signToken(payload)

    // 记录登录信息（User-Agent），失败不阻塞登录流程
    try {
      await prisma.loginRecord.create({
        data: {
          accountId: account.id,
          userAgent: request.headers['user-agent'] ?? null,
        },
      })
    } catch {
      // 记录失败不影响登录
    }

    return reply.send({
      token,
      user: {
        id: account.id,
        username: account.username,
        role: account.role,
        branchId: account.branchId,
        status: account.status,
      },
    })
  })

  // GET /api/auth/me - 获取当前登录用户信息
  fastify.get(
    '/api/auth/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: '未认证' })
      }

      const account = await prisma.account.findUnique({
        where: { id: request.user.id },
      })

      if (!account) {
        return reply.code(404).send({ error: '用户不存在' })
      }

      return reply.send({
        id: account.id,
        username: account.username,
        role: account.role,
        branchId: account.branchId,
        status: account.status,
      })
    }
  )
}
