import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { hashPassword } from '../utils/password'
import { Role, AccountStatus } from '../../generated/prisma/client'

export default async function accountRoutes(fastify: FastifyInstance) {
  // POST /api/accounts - 添加账户
  fastify.post(
    '/api/accounts',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { username, password, role, branchId } = request.body as {
        username: string
        password: string
        role: Role
        branchId?: number
      }
      const currentUser = request.user

      if (!username || !password || !role) {
        return reply.code(400).send({ error: '用户名、密码和角色不能为空' })
      }

      const validRoles = [Role.HUIZHANG, Role.CHAOGUAN, Role.GUANLI]
      if (!validRoles.includes(role)) {
        return reply.code(400).send({ error: '无效的角色' })
      }

      let targetBranchId: number | null = null

      if (currentUser.role === Role.HUIZHANG) {
        // 会长添加超管/管理时需指定 branchId
        if (role === Role.CHAOGUAN || role === Role.GUANLI) {
          if (!branchId) {
            return reply.code(400).send({ error: '请指定分部' })
          }
          targetBranchId = branchId
        }
      } else if (currentUser.role === Role.CHAOGUAN) {
        // 超管不能添加超管
        if (role === Role.CHAOGUAN) {
          return reply.code(403).send({ error: '超管不能添加超管账户' })
        }
        // 超管不能添加会长
        if (role === Role.HUIZHANG) {
          return reply.code(403).send({ error: '无权添加会长账户' })
        }
        // 超管添加管理时 branchId 必须是自己分部
        if (role === Role.GUANLI) {
          if (currentUser.branchId === null) {
            return reply.code(403).send({ error: '超管未关联分部' })
          }
          if (branchId && branchId !== currentUser.branchId) {
            return reply.code(403).send({ error: '只能添加本分部的管理账户' })
          }
          targetBranchId = currentUser.branchId
        }
      }

      // 用户名不能重复
      const existing = await prisma.account.findUnique({ where: { username } })
      if (existing) {
        return reply.code(400).send({ error: '用户名已存在' })
      }

      // 校验分部存在
      if (targetBranchId) {
        const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } })
        if (!branch) {
          return reply.code(400).send({ error: '分部不存在' })
        }
      }

      const passwordHash = await hashPassword(password)
      const account = await prisma.account.create({
        data: {
          username,
          passwordHash,
          role,
          branchId: targetBranchId,
        },
        select: {
          id: true,
          username: true,
          role: true,
          branchId: true,
          status: true,
          createdAt: true,
        },
      })

      return reply.code(201).send(account)
    }
  )

  // GET /api/accounts - 查询账户列表
  fastify.get(
    '/api/accounts',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user

      // 超管查看本分部管理；会长查看所有
      if (currentUser.role === Role.CHAOGUAN && currentUser.branchId === null) {
        return reply.send([])
      }

      const where =
        currentUser.role === Role.CHAOGUAN
          ? { branchId: currentUser.branchId as number, role: Role.GUANLI }
          : {}

      const accounts = await prisma.account.findMany({
        where,
        select: {
          id: true,
          username: true,
          role: true,
          branchId: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(accounts)
    }
  )

  // PATCH /api/accounts/:id/status - 禁用/启用账户
  fastify.patch(
    '/api/accounts/:id/status',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { status } = request.body as { status: AccountStatus }
      const currentUser = request.user

      if (!status || ![AccountStatus.ACTIVE, AccountStatus.DISABLED].includes(status)) {
        return reply.code(400).send({ error: '无效的状态' })
      }

      const accountId = Number(id)
      if (Number.isNaN(accountId)) {
        return reply.code(400).send({ error: '无效的账户ID' })
      }

      // 不能禁用自己
      if (accountId === currentUser.id) {
        return reply.code(400).send({ error: '不能操作自己的账户' })
      }

      const account = await prisma.account.findUnique({ where: { id: accountId } })
      if (!account) {
        return reply.code(404).send({ error: '账户不存在' })
      }

      // 不能操作会长账户
      if (account.role === Role.HUIZHANG) {
        return reply.code(403).send({ error: '不能操作会长账户' })
      }

      // 超管只能操作本分部管理
      if (currentUser.role === Role.CHAOGUAN) {
        if (account.role !== Role.GUANLI) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
        if (account.branchId !== currentUser.branchId) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
      }

      const updated = await prisma.account.update({
        where: { id: accountId },
        data: { status },
        select: {
          id: true,
          username: true,
          role: true,
          branchId: true,
          status: true,
        },
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/accounts/:id - 删除账户
  fastify.delete(
    '/api/accounts/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user

      const accountId = Number(id)
      if (Number.isNaN(accountId)) {
        return reply.code(400).send({ error: '无效的账户ID' })
      }

      // 不能删除自己
      if (accountId === currentUser.id) {
        return reply.code(400).send({ error: '不能删除自己的账户' })
      }

      const account = await prisma.account.findUnique({ where: { id: accountId } })
      if (!account) {
        return reply.code(404).send({ error: '账户不存在' })
      }

      // 不能删除会长账户
      if (account.role === Role.HUIZHANG) {
        return reply.code(403).send({ error: '不能删除会长账户' })
      }

      // 超管只能删除本分部管理
      if (currentUser.role === Role.CHAOGUAN) {
        if (account.role !== Role.GUANLI) {
          return reply.code(403).send({ error: '只能删除本分部的管理账户' })
        }
        if (account.branchId !== currentUser.branchId) {
          return reply.code(403).send({ error: '只能删除本分部的管理账户' })
        }
      }

      await prisma.account.delete({ where: { id: accountId } })

      return reply.send({ message: '账户已删除' })
    }
  )

  // PUT /api/accounts/:id - 更新账户（用户名、密码、角色、分部）
  fastify.put(
    '/api/accounts/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { username, password, role, branchId } = request.body as {
        username?: string
        password?: string
        role?: Role
        branchId?: number | null
      }
      const currentUser = request.user

      const accountId = Number(id)
      if (Number.isNaN(accountId)) {
        return reply.code(400).send({ error: '无效的账户ID' })
      }

      // 不能操作自己
      if (accountId === currentUser.id) {
        return reply.code(400).send({ error: '不能修改自己的账户' })
      }

      const account = await prisma.account.findUnique({ where: { id: accountId } })
      if (!account) {
        return reply.code(404).send({ error: '账户不存在' })
      }

      // 不能操作会长账户
      if (account.role === Role.HUIZHANG) {
        return reply.code(403).send({ error: '不能操作会长账户' })
      }

      // 超管只能操作本分部管理
      if (currentUser.role === Role.CHAOGUAN) {
        if (account.role !== Role.GUANLI) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
        if (account.branchId !== currentUser.branchId) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
      }

      // 构建更新数据
      const updateData: {
        username?: string
        passwordHash?: string
        role?: Role
        branchId?: number | null
      } = {}

      if (username !== undefined && username !== account.username) {
        if (!username.trim()) {
          return reply.code(400).send({ error: '用户名不能为空' })
        }
        const existing = await prisma.account.findUnique({ where: { username } })
        if (existing) {
          return reply.code(400).send({ error: '用户名已存在' })
        }
        updateData.username = username.trim()
      }

      if (password !== undefined && password.length > 0) {
        updateData.passwordHash = await hashPassword(password)
      }

      if (role !== undefined && role !== account.role) {
        const validRoles: Role[] = [Role.CHAOGUAN, Role.GUANLI]
        if (!validRoles.includes(role)) {
          return reply.code(400).send({ error: '无效的角色' })
        }
        // 超管不能将管理提升为超管
        if (currentUser.role === Role.CHAOGUAN && role === Role.CHAOGUAN) {
          return reply.code(403).send({ error: '无权设置超管角色' })
        }
        updateData.role = role
      }

      if (branchId !== undefined && branchId !== account.branchId) {
        if (branchId !== null) {
          const branch = await prisma.branch.findUnique({ where: { id: branchId } })
          if (!branch) {
            return reply.code(400).send({ error: '分部不存在' })
          }
        }
        // 超管只能设置为自己分部
        if (currentUser.role === Role.CHAOGUAN) {
          if (branchId !== currentUser.branchId) {
            return reply.code(403).send({ error: '只能设置为本分部' })
          }
        }
        updateData.branchId = branchId
      }

      if (Object.keys(updateData).length === 0) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      const updated = await prisma.account.update({
        where: { id: accountId },
        data: updateData,
        select: {
          id: true,
          username: true,
          role: true,
          branchId: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
        },
      })

      return reply.send(updated)
    }
  )
}
