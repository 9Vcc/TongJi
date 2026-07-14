import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { signToken } from '../utils/jwt'
import { comparePassword, hashPassword } from '../utils/password'
import { authenticate } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'
import type { JwtPayload } from '../types'

/**
 * 加载账户的所有授权厅 ID 列表
 * 超管：主厅 + AccountBranch 额外授权厅
 * 其他角色：仅主厅（或空数组）
 */
async function loadBranchIds(accountId: number, role: Role, branchId: number | null): Promise<number[]> {
  if (role !== Role.CHAOGUAN || branchId === null) {
    return branchId !== null ? [branchId] : []
  }
  const extra = await prisma.accountBranch.findMany({
    where: { accountId },
    select: { branchId: true },
  })
  return [branchId, ...extra.map((ab) => ab.branchId)]
}

/**
 * 加载账户的所有授权合厅组 ID 列表
 * 仅超管支持合厅组授权
 */
async function loadGroupIds(accountId: number, role: Role): Promise<number[]> {
  if (role !== Role.CHAOGUAN) return []
  const groups = await prisma.accountGroup.findMany({
    where: { accountId },
    select: { groupId: true },
  })
  return groups.map((ag) => ag.groupId)
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login - 登录
  // 限流：每 IP+用户名组合每分钟最多 5 次，防止暴力破解
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request) => {
          const body = request.body as { username?: string } | undefined
          const username = body?.username || 'unknown'
          return `${request.ip}:${username}`
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string }

    if (!username || !password) {
      return reply.code(400).send({ error: '用户名和密码不能为空' })
    }

    const account = await prisma.account.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        nickname: true,
        passwordHash: true,
        role: true,
        branchId: true,
        mainGroupId: true,
        status: true,
        mainGroup: { select: { id: true, name: true } },
      },
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

    const branchIds = await loadBranchIds(account.id, account.role, account.branchId)
    const groupIds = await loadGroupIds(account.id, account.role)

    const payload: JwtPayload = {
      id: account.id,
      username: account.username,
      role: account.role,
      branchId: account.branchId,
      branchIds,
      groupIds,
      mainGroupId: account.mainGroupId,
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
        nickname: account.nickname,
        role: account.role,
        branchId: account.branchId,
        mainGroupId: account.mainGroupId,
        mainGroup: account.mainGroup,
        branchIds,
        groupIds,
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
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          branchId: true,
          mainGroupId: true,
          status: true,
          mainGroup: { select: { id: true, name: true } },
        },
      })

      if (!account) {
        return reply.code(404).send({ error: '用户不存在' })
      }

      const branchIds = await loadBranchIds(account.id, account.role, account.branchId)
      const groupIds = await loadGroupIds(account.id, account.role)

      return reply.send({
        id: account.id,
        username: account.username,
        nickname: account.nickname,
        role: account.role,
        branchId: account.branchId,
        mainGroupId: account.mainGroupId,
        mainGroup: account.mainGroup,
        branchIds,
        groupIds,
        status: account.status,
      })
    }
  )

  // PATCH /api/auth/me - 更新自己的昵称（仅限 nickname 字段，避免越权改角色/密码）
  fastify.patch(
    '/api/auth/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: '未认证' })
      }

      const { nickname } = request.body as { nickname?: string | null }
      const trimmed =
        typeof nickname === 'string' && nickname.trim().length > 0
          ? nickname.trim().slice(0, 50)
          : null

      const updated = await prisma.account.update({
        where: { id: request.user.id },
        data: { nickname: trimmed },
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          branchId: true,
          mainGroupId: true,
          status: true,
          mainGroup: { select: { id: true, name: true } },
        },
      })

      const branchIds = await loadBranchIds(updated.id, updated.role, updated.branchId)
      const groupIds = await loadGroupIds(updated.id, updated.role)

      return reply.send({ ...updated, branchIds, groupIds })
    }
  )

  // PUT /api/auth/me/password - 修改自己的密码
  // body: { currentPassword: string, newPassword: string }
  // 校验：当前密码正确；新密码长度 6-50；新密码不能与旧密码相同
  fastify.put(
    '/api/auth/me/password',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: '未认证' })
      }

      const { currentPassword, newPassword } = request.body as {
        currentPassword?: string
        newPassword?: string
      }

      // 参数校验
      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: '请输入当前密码和新密码' })
      }
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return reply.code(400).send({ error: '密码格式不正确' })
      }
      if (newPassword.length < 6 || newPassword.length > 50) {
        return reply.code(400).send({ error: '新密码长度需为 6-50 位' })
      }
      if (currentPassword === newPassword) {
        return reply.code(400).send({ error: '新密码不能与当前密码相同' })
      }

      // 查询账户并校验当前密码
      const account = await prisma.account.findUnique({
        where: { id: request.user.id },
      })
      if (!account) {
        return reply.code(404).send({ error: '用户不存在' })
      }

      const valid = await comparePassword(currentPassword, account.passwordHash)
      if (!valid) {
        return reply.code(400).send({ error: '当前密码错误' })
      }

      // 更新密码
      const newHash = await hashPassword(newPassword)
      await prisma.account.update({
        where: { id: account.id },
        data: { passwordHash: newHash },
      })

      return reply.send({ message: '密码修改成功' })
    }
  )
}
