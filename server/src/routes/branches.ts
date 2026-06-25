import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { Role, StatCycle } from '../../generated/prisma/client'

export default async function branchRoutes(fastify: FastifyInstance) {
  // POST /api/branches - 创建分部
  fastify.post(
    '/api/branches',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { name, statCycle } = request.body as {
        name: string
        statCycle?: string
      }

      if (!name) {
        return reply.code(400).send({ error: '分部名称不能为空' })
      }

      // 解析统计周期，默认按周
      const cycle: StatCycle =
        statCycle === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK

      // 创建分部时自动创建默认奖励规则
      const branch = await prisma.$transaction(async (tx) => {
        const b = await tx.branch.create({
          data: { name, statCycle: cycle },
        })
        await tx.rewardRule.create({
          data: {
            branchId: b.id,
            sgRatio: 3,
            qmRatio: 3,
            rank1Reward: 100,
            rank2Reward: 80,
            rank3Reward: 60,
            maixuThreshold: 40,
            maixuReward: 52,
          },
        })
        return b
      })

      return reply.code(201).send(branch)
    }
  )

  // GET /api/branches - 查询分部列表
  fastify.get(
    '/api/branches',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user

      // 会长查看所有，超管/管理查看自己分部
      const where =
        currentUser.role !== Role.HUIZHANG
          ? { id: currentUser.branchId ?? -1 }
          : {}

      const branches = await prisma.branch.findMany({
        where,
        include: {
          _count: {
            select: {
              personnelBranches: true,
              dataRecords: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      const result = branches.map((b) => ({
        id: b.id,
        name: b.name,
        statCycle: b.statCycle,
        createdAt: b.createdAt,
        personnelCount: b._count.personnelBranches,
        dataRecordCount: b._count.dataRecords,
      }))

      return reply.send(result)
    }
  )

  // PUT /api/branches/:id - 更新分部名称与统计周期
  fastify.put(
    '/api/branches/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const { name, statCycle } = request.body as {
        name?: string
        statCycle?: string
      }
      const branchId = Number(id)

      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的分部ID' })
      }

      // 超管只能更新自己分部（会长由 requireRole 放行）
      if (currentUser.role === Role.CHAOGUAN) {
        if (
          currentUser.branchId === null ||
          branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能更新本分部' })
        }
      }

      // 至少要有一个可更新字段
      if (name === undefined && statCycle === undefined) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      if (name !== undefined && (!name || !name.trim())) {
        return reply.code(400).send({ error: '分部名称不能为空' })
      }

      // 统计周期校验
      let cycle: StatCycle | undefined
      if (statCycle !== undefined) {
        if (statCycle !== 'WEEK' && statCycle !== 'MONTH') {
          return reply.code(400).send({ error: '统计周期必须为 WEEK 或 MONTH' })
        }
        cycle = statCycle === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
      }

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      })
      if (!branch) {
        return reply.code(404).send({ error: '分部不存在' })
      }

      // 名称重复校验
      if (name !== undefined) {
        const existing = await prisma.branch.findFirst({
          where: { name: name.trim() },
        })
        if (existing && existing.id !== branchId) {
          return reply.code(400).send({ error: '分部名称已存在' })
        }
      }

      const data: { name?: string; statCycle?: StatCycle } = {}
      if (name !== undefined) data.name = name.trim()
      if (cycle !== undefined) data.statCycle = cycle

      const updated = await prisma.branch.update({
        where: { id: branchId },
        data,
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/branches/:id - 删除分部（超管及以上）
  fastify.delete(
    '/api/branches/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const branchId = Number(id)

      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的分部ID' })
      }

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        include: {
          _count: { select: { dataRecords: true } },
        },
      })

      if (!branch) {
        return reply.code(404).send({ error: '分部不存在' })
      }

      // 分部下有数据记录时禁止删除
      if (branch._count.dataRecords > 0) {
        return reply.code(400).send({ error: '分部下有数据记录，禁止删除' })
      }

      // 删除分部时同时删除关联的奖励规则及人员关联
      await prisma.$transaction(async (tx) => {
        await tx.rewardRule.deleteMany({ where: { branchId } })
        await tx.personnelBranch.deleteMany({ where: { branchId } })
        await tx.branch.delete({ where: { id: branchId } })
      })

      return reply.send({ message: '分部已删除' })
    }
  )
}
