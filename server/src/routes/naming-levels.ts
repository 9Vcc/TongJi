import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch, getAccessibleBranchIds } from '../middleware/auth'
import { Role, StatCycle } from '../../generated/prisma/client'
import { createNotification } from '../services/notification'
import { NotificationType } from '../../generated/prisma/client'
import { isNonNegInt } from '../utils/validation'

interface NamingLevelInput {
  name?: string
  threshold?: number
  reward?: number
  sortOrder?: number
}

export default async function namingLevelRoutes(fastify: FastifyInstance) {
  // GET /api/naming-levels - 查询某厅的冠名等级
  fastify.get(
    '/api/naming-levels',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

      let branchFilter: number | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          branchFilter = Number.isNaN(n) ? undefined : n
        }
      } else {
        branchFilter = currentUser.branchId ?? undefined
      }

      const levels = await prisma.namingLevel.findMany({
        where: branchFilter ? { branchId: branchFilter } : {},
        include: { branch: { select: { id: true, name: true } } },
        orderBy: [{ threshold: 'desc' }, { sortOrder: 'desc' }, { id: 'asc' }],
      })

      return reply.send(levels)
    }
  )

  // POST /api/naming-levels - 创建冠名等级
  fastify.post(
    '/api/naming-levels',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as NamingLevelInput & { branchId?: number }

      const { name, threshold, reward, sortOrder } = body
      const requestedBranchId = body.branchId

      // 权限：超管只能操作授权厅
      const resolvedBranchId =
        currentUser.role === Role.HUIZHANG
          ? requestedBranchId
          : currentUser.branchId
      if (!resolvedBranchId) {
        return reply.code(400).send({ error: '请指定分部' })
      }
      if (currentUser.role === Role.CHAOGUAN && !canAccessBranch(currentUser, resolvedBranchId)) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      if (!name || !name.trim()) {
        return reply.code(400).send({ error: '等级名称不能为空' })
      }
      if (!isNonNegInt(threshold) || threshold! <= 0) {
        return reply.code(400).send({ error: '收光阈值必须为正整数' })
      }
      if (reward !== undefined && !isNonNegInt(reward)) {
        return reply.code(400).send({ error: '福利必须为非负整数' })
      }

      // 校验厅存在且为按月统计
      const branch = await prisma.branch.findUnique({
        where: { id: resolvedBranchId },
      })
      if (!branch) {
        return reply.code(404).send({ error: '分部不存在' })
      }
      if (branch.statCycle !== StatCycle.MONTH) {
        return reply.code(400).send({ error: '冠名仅支持按月统计的厅' })
      }

      const created = await prisma.namingLevel.create({
        data: {
          branchId: resolvedBranchId,
          name: name.trim(),
          threshold: threshold!,
          reward: reward ?? 0,
          sortOrder: sortOrder ?? 0,
        },
      })

      await createNotification(
        resolvedBranchId,
        NotificationType.RULE_CHANGE,
        `分部【${branch.name}】新增冠名等级【${name.trim()}】`
      )

      return reply.code(201).send(created)
    }
  )

  // PUT /api/naming-levels/:id - 更新冠名等级
  fastify.put(
    '/api/naming-levels/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const body = request.body as NamingLevelInput

      const levelId = Number(id)
      if (Number.isNaN(levelId)) {
        return reply.code(400).send({ error: '无效的等级ID' })
      }

      const existing = await prisma.namingLevel.findUnique({
        where: { id: levelId },
        include: { branch: true },
      })
      if (!existing) {
        return reply.code(404).send({ error: '冠名等级不存在' })
      }

      // 权限：超管只能操作本厅
      if (currentUser.role === Role.CHAOGUAN && currentUser.branchId !== existing.branchId) {
        return reply.code(403).send({ error: '只能操作本分部' })
      }

      const data: Record<string, number | string> = {}
      if (body.name !== undefined) {
        if (!body.name.trim()) {
          return reply.code(400).send({ error: '等级名称不能为空' })
        }
        data.name = body.name.trim()
      }
      if (body.threshold !== undefined) {
        if (!isNonNegInt(body.threshold) || body.threshold <= 0) {
          return reply.code(400).send({ error: '收光阈值必须为正整数' })
        }
        data.threshold = body.threshold
      }
      if (body.reward !== undefined) {
        if (!isNonNegInt(body.reward)) {
          return reply.code(400).send({ error: '福利必须为非负整数' })
        }
        data.reward = body.reward
      }
      if (body.sortOrder !== undefined) {
        if (!isNonNegInt(body.sortOrder)) {
          return reply.code(400).send({ error: '排序必须为非负整数' })
        }
        data.sortOrder = body.sortOrder
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      const updated = await prisma.namingLevel.update({
        where: { id: levelId },
        data,
      })

      await createNotification(
        existing.branchId,
        NotificationType.RULE_CHANGE,
        `分部【${existing.branch.name}】冠名等级【${existing.name}】已更新`
      )

      return reply.send(updated)
    }
  )

  // DELETE /api/naming-levels/:id - 删除冠名等级
  fastify.delete(
    '/api/naming-levels/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }

      const levelId = Number(id)
      if (Number.isNaN(levelId)) {
        return reply.code(400).send({ error: '无效的等级ID' })
      }

      const existing = await prisma.namingLevel.findUnique({
        where: { id: levelId },
        include: { branch: true },
      })
      if (!existing) {
        return reply.code(404).send({ error: '冠名等级不存在' })
      }

      if (currentUser.role === Role.CHAOGUAN && !canAccessBranch(currentUser, existing.branchId)) {
        return reply.code(403).send({ error: '只能操作授权厅' })
      }

      // 删除等级会级联删除关联的 DataRecordNaming
      await prisma.namingLevel.delete({ where: { id: levelId } })

      await createNotification(
        existing.branchId,
        NotificationType.RULE_CHANGE,
        `分部【${existing.branch.name}】冠名等级【${existing.name}】已删除`
      )

      return reply.code(204).send()
    }
  )
}
