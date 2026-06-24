import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'
import { resolveQueryBranchId } from '../utils/welfare'

export default async function notificationRoutes(fastify: FastifyInstance) {
  // GET /api/notifications - 查询通知列表
  fastify.get(
    '/api/notifications',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as {
        branchId?: string
      }

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const notifications = await prisma.notification.findMany({
        where: branchFilter ? { branchId: branchFilter } : {},
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(notifications)
    }
  )

  // PATCH /api/notifications/:id/read - 标记已读
  fastify.patch(
    '/api/notifications/:id/read',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }

      const notificationId = Number(id)
      if (Number.isNaN(notificationId)) {
        return reply.code(400).send({ error: '无效的通知ID' })
      }

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      })
      if (!notification) {
        return reply.code(404).send({ error: '通知不存在' })
      }

      // 非会长只能查看/操作本分部通知
      if (currentUser.role !== Role.HUIZHANG) {
        if (
          currentUser.branchId === null ||
          notification.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能操作本分部通知' })
        }
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      })

      return reply.send(updated)
    }
  )
}
