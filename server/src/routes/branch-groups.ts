import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, getAccessibleGroupIds } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'

export default async function branchGroupRoutes(fastify: FastifyInstance) {
  // GET /api/branch-groups - 列出合厅组（含成员厅信息）
  // 会长：返回所有合厅组
  // 超管：仅返回授权的合厅组
  fastify.get(
    '/api/branch-groups',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user

      // 超管：仅返回授权的合厅组
      const accessibleGroupIds = getAccessibleGroupIds(currentUser)
      const where = accessibleGroupIds ? { id: { in: accessibleGroupIds } } : {}

      const groups = await prisma.branchGroup.findMany({
        where,
        include: {
          branches: {
            select: {
              id: true,
              name: true,
              statCycle: true,
              closed: true,
            },
            orderBy: { id: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      const result = groups.map((g) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        branches: g.branches.map((b) => ({
          id: b.id,
          name: b.name,
          statCycle: b.statCycle,
          closed: b.closed,
        })),
      }))

      return reply.send(result)
    }
  )

  // POST /api/branch-groups - 创建合厅组
  // body: { name: string, branchIds: number[] }
  fastify.post(
    '/api/branch-groups',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { name, branchIds } = request.body as {
        name?: string
        branchIds?: number[]
      }

      // 校验合厅名称
      if (!name || !name.trim()) {
        return reply.code(400).send({ error: '合厅名称不能为空' })
      }

      // 校验厅 ID 列表：合并至少需要 2 个厅
      if (!Array.isArray(branchIds) || branchIds.length < 2) {
        return reply.code(400).send({ error: '合并至少需要选择 2 个厅' })
      }

      // 去重，避免重复 ID
      const uniqueBranchIds = Array.from(new Set(branchIds))

      // 查询这些厅当前是否已属于其他合厅组
      const existing = await prisma.branch.findMany({
        where: {
          id: { in: uniqueBranchIds },
          groupId: { not: null },
        },
        select: { id: true, name: true },
      })

      if (existing.length > 0) {
        const names = existing.map((b) => b.name).join('、')
        return reply.code(400).send({
          error: `以下厅已属于其他合厅组：${names}`,
        })
      }

      // 校验厅是否存在（覆盖传入不存在的 ID 的情况）
      const branches = await prisma.branch.findMany({
        where: { id: { in: uniqueBranchIds } },
        select: { id: true, name: true, statCycle: true },
      })
      if (branches.length !== uniqueBranchIds.length) {
        return reply.code(400).send({ error: '部分厅不存在' })
      }

      // 校验统计周期一致：月统计厅只能与月统计厅合并，周统计同理
      const cycles = new Set(branches.map((b) => b.statCycle))
      if (cycles.size > 1) {
        return reply.code(400).send({ error: '统计周期不一致，月统计厅只能与月统计厅合并，周统计同理' })
      }

      // 事务：创建合厅组并将对应厅的 groupId 设为新组 ID
      const created = await prisma.$transaction(async (tx) => {
        const group = await tx.branchGroup.create({
          data: { name: name.trim() },
        })
        await tx.branch.updateMany({
          where: { id: { in: uniqueBranchIds } },
          data: { groupId: group.id },
        })
        return group
      })

      return reply.code(201).send(created)
    }
  )

  // PUT /api/branch-groups/:id - 重命名合厅组
  // body: { name: string }
  fastify.put(
    '/api/branch-groups/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { name } = request.body as { name?: string }

      const groupId = Number(id)
      if (Number.isNaN(groupId)) {
        return reply.code(400).send({ error: '无效的合厅组ID' })
      }

      if (!name || !name.trim()) {
        return reply.code(400).send({ error: '合厅名称不能为空' })
      }

      const existing = await prisma.branchGroup.findUnique({
        where: { id: groupId },
      })
      if (!existing) {
        return reply.code(404).send({ error: '合厅组不存在' })
      }

      const updated = await prisma.branchGroup.update({
        where: { id: groupId },
        data: { name: name.trim() },
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/branch-groups/:id - 解散合厅组
  // 事务内：将所有成员厅的 groupId 设为 null，删除 BranchGroup 记录（不删除厅本身）
  fastify.delete(
    '/api/branch-groups/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const groupId = Number(id)

      if (Number.isNaN(groupId)) {
        return reply.code(400).send({ error: '无效的合厅组ID' })
      }

      const existing = await prisma.branchGroup.findUnique({
        where: { id: groupId },
      })
      if (!existing) {
        return reply.code(404).send({ error: '合厅组不存在' })
      }

      // 事务：先解除成员厅的 groupId 关联，再删除合厅组
      await prisma.$transaction(async (tx) => {
        await tx.branch.updateMany({
          where: { groupId },
          data: { groupId: null },
        })
        await tx.branchGroup.delete({ where: { id: groupId } })
      })

      return reply.code(204).send()
    }
  )

  // POST /api/branch-groups/:id/branches - 添加厅到合厅组
  // body: { branchId: number }
  fastify.post(
    '/api/branch-groups/:id/branches',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { branchId } = request.body as { branchId?: number }

      const groupId = Number(id)
      if (Number.isNaN(groupId)) {
        return reply.code(400).send({ error: '无效的合厅组ID' })
      }

      if (!branchId || Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '请指定要添加的厅' })
      }

      const group = await prisma.branchGroup.findUnique({
        where: { id: groupId },
      })
      if (!group) {
        return reply.code(404).send({ error: '合厅组不存在' })
      }

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      })
      if (!branch) {
        return reply.code(404).send({ error: '厅不存在' })
      }

      // 校验：厅不存在 groupId 或 groupId 等于当前组
      if (branch.groupId !== null && branch.groupId !== groupId) {
        return reply.code(400).send({ error: '该厅已属于其他合厅组' })
      }

      // 幂等处理：已在当前组则直接返回成功
      if (branch.groupId === groupId) {
        return reply.send({ message: '该厅已在合厅组中' })
      }

      // 校验统计周期一致：待添加厅的 statCycle 必须与合厅组现有成员一致
      const memberCycles = await prisma.branch.findMany({
        where: { groupId },
        select: { statCycle: true },
      })
      if (memberCycles.length > 0) {
        const groupCycle = memberCycles[0].statCycle
        if (branch.statCycle !== groupCycle) {
          return reply.code(400).send({ error: '统计周期不一致，月统计厅只能与月统计厅合并，周统计同理' })
        }
      }

      await prisma.branch.update({
        where: { id: branchId },
        data: { groupId },
      })

      return reply.code(201).send({ message: '已添加到合厅组' })
    }
  )

  // DELETE /api/branch-groups/:id/branches/:branchId - 从合厅组移除厅
  // 将该厅 groupId 设为 null；若移除后组内只剩 1 个厅，自动解散该组
  fastify.delete(
    '/api/branch-groups/:id/branches/:branchId',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG)] },
    async (request, reply) => {
      const { id, branchId: branchIdParam } = request.params as {
        id: string
        branchId: string
      }

      const groupId = Number(id)
      const branchId = Number(branchIdParam)

      if (Number.isNaN(groupId)) {
        return reply.code(400).send({ error: '无效的合厅组ID' })
      }
      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的厅ID' })
      }

      const group = await prisma.branchGroup.findUnique({
        where: { id: groupId },
        include: {
          branches: { select: { id: true }, orderBy: { id: 'asc' } },
        },
      })
      if (!group) {
        return reply.code(404).send({ error: '合厅组不存在' })
      }

      // 校验该厅是否属于此合厅组
      const belongs = group.branches.some((b) => b.id === branchId)
      if (!belongs) {
        return reply.code(400).send({ error: '该厅不在该合厅组中' })
      }

      // 事务：移除厅；若移除后组内成员不足 2 个，则自动解散该组
      await prisma.$transaction(async (tx) => {
        await tx.branch.update({
          where: { id: branchId },
          data: { groupId: null },
        })

        // 剩余成员厅
        const remaining = await tx.branch.findMany({
          where: { groupId },
          select: { id: true },
        })

        // 合并至少需要 2 个厅，不足则自动解散
        if (remaining.length < 2) {
          // 将剩余厅的 groupId 解除（若有）
          if (remaining.length > 0) {
            await tx.branch.updateMany({
              where: { groupId },
              data: { groupId: null },
            })
          }
          await tx.branchGroup.delete({ where: { id: groupId } })
        }
      })

      return reply.code(204).send()
    }
  )
}
