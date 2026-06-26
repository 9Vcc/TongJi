import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'

/**
 * 登录记录路由
 * 仅会长可见：查看所有账户的登录记录（设备、登录时间）
 */
export default async function loginRecordRoutes(fastify: FastifyInstance) {
  // GET /api/login-records - 查询登录记录
  // 查询参数：accountId?(指定账户), date?(YYYY-MM-DD 当天), limit?
  fastify.get(
    '/api/login-records',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const query = request.query as {
        accountId?: string
        date?: string
        limit?: string
      }

      const where: {
        accountId?: number
        loginTime?: { gte: Date; lt: Date }
      } = {}

      if (query.accountId) {
        const aid = Number(query.accountId)
        if (!Number.isNaN(aid)) where.accountId = aid
      }

      // 解析 date 为当天 [start, end)
      if (query.date) {
        const d = new Date(query.date)
        if (!Number.isNaN(d.getTime())) {
          const start = new Date(d)
          start.setHours(0, 0, 0, 0)
          const end = new Date(start)
          end.setDate(end.getDate() + 1)
          where.loginTime = { gte: start, lt: end }
        }
      }

      const limit = Math.min(Number(query.limit) || 200, 500)

      const records = await prisma.loginRecord.findMany({
        where,
        include: {
          account: {
            select: { id: true, username: true, role: true, branchId: true },
          },
        },
        orderBy: { loginTime: 'desc' },
        take: limit,
      })

      return reply.send(records)
    }
  )
}
