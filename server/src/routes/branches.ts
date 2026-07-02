import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch, getAccessibleBranchIds } from '../middleware/auth'
import { Role, StatCycle } from '../../generated/prisma/client'
import { comparePassword } from '../utils/password'

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

      // 会长查看所有；超管查看所有授权厅；管理查看自己分部
      const accessibleIds = getAccessibleBranchIds(currentUser)
      const where =
        accessibleIds !== null
          ? { id: { in: accessibleIds } }
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

      // 超管只能更新授权厅（会长由 requireRole 放行）
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, branchId)) {
          return reply.code(403).send({ error: '只能更新授权厅' })
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
  // 删除前需验证登录密码；将级联删除厅内所有数据与人员
  fastify.delete(
    '/api/branches/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { id } = request.params as { id: string }
      const { password } = (request.body ?? {}) as { password?: string }
      const branchId = Number(id)

      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的分部ID' })
      }

      // 密码二次确认
      if (!password) {
        return reply.code(400).send({ error: '请输入登录密码以确认删除' })
      }
      const account = await prisma.account.findUnique({
        where: { id: currentUser.id },
      })
      if (!account) {
        return reply.code(401).send({ error: '账户不存在' })
      }
      const pwdOk = await comparePassword(password, account.passwordHash)
      if (!pwdOk) {
        return reply.code(403).send({ error: '密码错误，删除已取消' })
      }

      // 超管只能删除授权厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, branchId)) {
          return reply.code(403).send({ error: '只能删除授权厅' })
        }
      }

      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      })

      if (!branch) {
        return reply.code(404).send({ error: '分部不存在' })
      }

      // 级联删除：厅内所有数据、人员、规则、冠名等级、通知等
      await prisma.$transaction(async (tx) => {
        // 1. 解除该厅下账户的 branchId 关联（账户本身保留，仅解绑分部）
        await tx.account.updateMany({
          where: { branchId },
          data: { branchId: null },
        })

        // 2. 删除该厅所有 DataRecord 的子表（冠名明细、修改历史）
        const recordIds = await tx.dataRecord.findMany({
          where: { branchId },
          select: { id: true },
        })
        if (recordIds.length > 0) {
          const recordIdList = recordIds.map((r) => r.id)
          await tx.dataRecordNaming.deleteMany({
            where: { recordId: { in: recordIdList } },
          })
          await tx.dataHistory.deleteMany({
            where: { recordId: { in: recordIdList } },
          })
          await tx.dataRecord.deleteMany({
            where: { id: { in: recordIdList } },
          })
        }

        // 3. 收集该厅关联的人员 ID（用于稍后删除仅属于该厅的人员）
        const branchPersonnel = await tx.personnelBranch.findMany({
          where: { branchId },
          select: { personnelId: true },
        })
        const branchPersonnelIds = branchPersonnel.map((p) => p.personnelId)

        // 4. 删除人员-厅关联
        await tx.personnelBranch.deleteMany({ where: { branchId } })

        // 5. 删除仅属于该厅的人员（删除关联后无其他厅关联的人员）
        if (branchPersonnelIds.length > 0) {
          // 查询这些人员在删除该厅关联后，是否仍存在其他厅关联
          const stillLinked = await tx.personnelBranch.findMany({
            where: { personnelId: { in: branchPersonnelIds } },
            select: { personnelId: true },
          })
          const stillLinkedSet = new Set(stillLinked.map((p) => p.personnelId))
          const orphanIds = branchPersonnelIds.filter(
            (pid) => !stillLinkedSet.has(pid)
          )
          if (orphanIds.length > 0) {
            await tx.personnel.deleteMany({
              where: { id: { in: orphanIds } },
            })
          }
        }

        // 6. 删除奖励规则、冠名等级、通知
        await tx.rewardRule.deleteMany({ where: { branchId } })
        await tx.namingLevel.deleteMany({ where: { branchId } })
        await tx.notification.deleteMany({ where: { branchId } })

        // 7. 删除厅本身
        await tx.branch.delete({ where: { id: branchId } })
      })

      return reply.send({ message: '分部及关联数据已删除' })
    }
  )
}
