import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, canAccessBranch } from '../middleware/auth'
import { Role, NotificationType } from '../../generated/prisma/client'
import { resolveQueryBranchId } from '../utils/welfare'

export default async function notificationRoutes(fastify: FastifyInstance) {
  // GET /api/notifications - 查询通知列表
  // 查询参数：branchId?(会长可指定), type?(按类型筛选), isRead?(按已读筛选), limit?(最大500)
  fastify.get(
    '/api/notifications',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam, type, isRead, limit: limitParam } =
        request.query as {
          branchId?: string
          type?: string
          isRead?: string
          limit?: string
        }

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      // 构建 where 条件
      const where: {
        branchId?: number
        type?: NotificationType
        isRead?: boolean
      } = {}
      if (branchFilter) where.branchId = branchFilter
      // 按类型筛选（校验枚举合法性）
      if (type) {
        const validTypes = ['RANK_PUBLISH', 'RULE_CHANGE', 'DATA_CHANGE']
        if (validTypes.includes(type)) {
          where.type = type as NotificationType
        }
      }
      // 按已读状态筛选（仅接受 'true'/'false'）
      if (isRead === 'true') where.isRead = true
      else if (isRead === 'false') where.isRead = false

      const limit = Math.min(Number(limitParam) || 500, 500)

      const notifications = await prisma.notification.findMany({
        where,
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return reply.send(notifications)
    }
  )

  // PATCH /api/notifications/:id/read - 标记单条已读
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

      // 非会长用户校验是否对通知所在厅有访问权限（超管可访问所有授权厅）
      if (currentUser.role !== Role.HUIZHANG) {
        if (!canAccessBranch(currentUser, notification.branchId)) {
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

  // PATCH /api/notifications/read-all - 批量标记已读（按分部过滤）
  // 查询参数：branchId?(会长可指定)，仅标记当前可见范围内的未读通知为已读
  fastify.patch(
    '/api/notifications/read-all',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as {
        branchId?: string
      }

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const where: { branchId?: number; isRead: boolean } = {
        isRead: false,
      }
      if (branchFilter) where.branchId = branchFilter

      const result = await prisma.notification.updateMany({
        where,
        data: { isRead: true },
      })

      return reply.send({ message: '已全部标记为已读', count: result.count })
    }
  )

  // DELETE /api/notifications/:id - 删除单条通知
  fastify.delete(
    '/api/notifications/:id',
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

      // 非会长用户校验是否对通知所在厅有访问权限（超管可访问所有授权厅）
      if (currentUser.role !== Role.HUIZHANG) {
        if (!canAccessBranch(currentUser, notification.branchId)) {
          return reply.code(403).send({ error: '只能删除本分部通知' })
        }
      }

      await prisma.notification.delete({ where: { id: notificationId } })

      return reply.send({ message: '通知已删除' })
    }
  )

  // DELETE /api/notifications - 清空已读通知（按分部过滤）
  // 查询参数：branchId?(会长可指定)，仅删除当前可见范围内的已读通知
  fastify.delete(
    '/api/notifications',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as {
        branchId?: string
      }

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)

      const where: { branchId?: number; isRead: boolean } = {
        isRead: true,
      }
      if (branchFilter) where.branchId = branchFilter

      const result = await prisma.notification.deleteMany({ where })

      return reply.send({
        message: '已清空已读通知',
        count: result.count,
      })
    }
  )
}
