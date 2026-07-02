import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch } from '../middleware/auth'
import { hashPassword } from '../utils/password'
import { Role, AccountStatus } from '../../generated/prisma/client'

/**
 * 加载账户的所有授权厅 ID 列表（主厅 + 额外授权厅）
 */
async function loadAccountBranchIds(accountId: number, branchId: number | null): Promise<number[]> {
  const extra = await prisma.accountBranch.findMany({
    where: { accountId },
    select: { branchId: true },
  })
  const extraIds = extra.map((ab) => ab.branchId)
  return branchId !== null ? [branchId, ...extraIds] : extraIds
}

/**
 * 同步超管的额外授权厅（删除旧记录，创建新记录）
 * branchIds 仅包含额外授权厅（不含主厅 branchId）
 */
async function syncAccountBranches(accountId: number, branchId: number | null, extraBranchIds: number[]): Promise<void> {
  await prisma.accountBranch.deleteMany({ where: { accountId } })
  // 过滤掉主厅（避免重复）和无效值
  const validIds = extraBranchIds.filter((id) => id !== branchId && id > 0)
  // 去重
  const uniqueIds = [...new Set(validIds)]
  if (uniqueIds.length > 0) {
    await prisma.accountBranch.createMany({
      data: uniqueIds.map((bid) => ({ accountId, branchId: bid })),
    })
  }
}

export default async function accountRoutes(fastify: FastifyInstance) {
  // POST /api/accounts - 添加账户
  fastify.post(
    '/api/accounts',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { username, password, role, branchId, nickname, branchIds } = request.body as {
        username: string
        password: string
        role: Role
        branchId?: number
        nickname?: string
        branchIds?: number[]
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
      let targetExtraBranchIds: number[] = []

      if (currentUser.role === Role.HUIZHANG) {
        // 会长添加会长时可不绑定分部
        if (role === Role.HUIZHANG) {
          targetBranchId = branchId ?? null
        }
        // 会长添加超管/管理时需指定 branchId
        if (role === Role.CHAOGUAN || role === Role.GUANLI) {
          if (!branchId) {
            return reply.code(400).send({ error: '请指定分部' })
          }
          targetBranchId = branchId
          // 超管支持多厅授权
          if (role === Role.CHAOGUAN && branchIds && branchIds.length > 0) {
            targetExtraBranchIds = branchIds
          }
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
        // 超管添加管理时 branchId 必须是自己授权厅之一
        if (role === Role.GUANLI) {
          if (currentUser.branchId === null) {
            return reply.code(403).send({ error: '超管未关联分部' })
          }
          if (branchId && !canAccessBranch(currentUser, branchId)) {
            return reply.code(403).send({ error: '只能添加本分部的管理账户' })
          }
          targetBranchId = branchId ?? currentUser.branchId
        }
      }

      // 用户名不能重复
      const existing = await prisma.account.findUnique({ where: { username } })
      if (existing) {
        return reply.code(400).send({ error: '用户名已存在' })
      }

      // 校验主分部存在
      if (targetBranchId) {
        const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } })
        if (!branch) {
          return reply.code(400).send({ error: '分部不存在' })
        }
      }

      // 校验额外授权厅存在
      if (targetExtraBranchIds.length > 0) {
        const branches = await prisma.branch.findMany({
          where: { id: { in: targetExtraBranchIds } },
          select: { id: true },
        })
        if (branches.length !== targetExtraBranchIds.length) {
          return reply.code(400).send({ error: '部分授权厅不存在' })
        }
      }

      const passwordHash = await hashPassword(password)
      const account = await prisma.account.create({
        data: {
          username,
          nickname: nickname?.trim() || null,
          passwordHash,
          role,
          branchId: targetBranchId,
        },
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          branchId: true,
          status: true,
          createdAt: true,
        },
      })

      // 超管：创建额外授权厅关联
      if (role === Role.CHAOGUAN && targetExtraBranchIds.length > 0) {
        await syncAccountBranches(account.id, targetBranchId, targetExtraBranchIds)
      }

      const allBranchIds = await loadAccountBranchIds(account.id, account.branchId)
      return reply.code(201).send({ ...account, branchIds: allBranchIds })
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
          nickname: true,
          role: true,
          branchId: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
          accountBranches: { select: { branchId: true, branch: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      })

      const result = accounts.map((a) => {
        const extraIds = a.accountBranches.map((ab) => ab.branchId)
        const allBranchIds = a.branchId !== null ? [a.branchId, ...extraIds] : extraIds
        const allBranches = [
          ...(a.branch ? [a.branch] : []),
          ...a.accountBranches.map((ab) => ab.branch),
        ]
        return {
          id: a.id,
          username: a.username,
          nickname: a.nickname,
          role: a.role,
          branchId: a.branchId,
          branchIds: allBranchIds,
          status: a.status,
          createdAt: a.createdAt,
          branch: a.branch,
          branches: allBranches,
        }
      })

      return reply.send(result)
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

      // 不能操作会长账户（会长除外）
      if (account.role === Role.HUIZHANG && currentUser.role !== Role.HUIZHANG) {
        return reply.code(403).send({ error: '不能操作会长账户' })
      }

      // 超管只能操作本分部管理
      if (currentUser.role === Role.CHAOGUAN) {
        if (account.role !== Role.GUANLI) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
        if (!canAccessBranch(currentUser, account.branchId ?? 0)) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
      }

      const updated = await prisma.account.update({
        where: { id: accountId },
        data: { status },
        select: {
          id: true,
          username: true,
          nickname: true,
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

      // 不能操作会长账户（会长除外）
      if (account.role === Role.HUIZHANG && currentUser.role !== Role.HUIZHANG) {
        return reply.code(403).send({ error: '不能删除会长账户' })
      }

      // 超管只能删除本分部管理
      if (currentUser.role === Role.CHAOGUAN) {
        if (account.role !== Role.GUANLI) {
          return reply.code(403).send({ error: '只能删除本分部的管理账户' })
        }
        if (!canAccessBranch(currentUser, account.branchId ?? 0)) {
          return reply.code(403).send({ error: '只能删除本分部的管理账户' })
        }
      }

      // 删除账户前需处理外键关联：
      // - LoginRecord.accountId（登录记录）
      // - DataHistory.modifierId（数据修改历史）
      // - DataRecord.createdBy（数据记录创建人）
      // 采用级联清理策略：登录记录与修改历史直接删除，数据记录改为重新归属到当前操作人
      await prisma.$transaction(async (tx) => {
        // 1. 删除该账户的登录记录
        await tx.loginRecord.deleteMany({ where: { accountId } })
        // 2. 删除该账户的数据修改历史
        await tx.dataHistory.deleteMany({ where: { modifierId: accountId } })
        // 3. 将该账户创建的数据记录转交给当前操作人，避免外键约束失败
        await tx.dataRecord.updateMany({
          where: { createdBy: accountId },
          data: { createdBy: currentUser.id },
        })
        // 4. AccountBranch 通过 onDelete: Cascade 自动删除
        // 5. 最后删除账户本身
        await tx.account.delete({ where: { id: accountId } })
      })

      return reply.send({ message: '账户已删除' })
    }
  )

  // PUT /api/accounts/:id - 更新账户（用户名、密码、角色、分部、授权厅）
  fastify.put(
    '/api/accounts/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { username, password, role, branchId, nickname, branchIds } = request.body as {
        username?: string
        password?: string
        role?: Role
        branchId?: number | null
        nickname?: string | null
        branchIds?: number[]
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

      // 不能操作会长账户（会长除外）
      if (account.role === Role.HUIZHANG && currentUser.role !== Role.HUIZHANG) {
        return reply.code(403).send({ error: '不能操作会长账户' })
      }

      // 超管只能操作本分部管理
      if (currentUser.role === Role.CHAOGUAN) {
        if (account.role !== Role.GUANLI) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
        if (!canAccessBranch(currentUser, account.branchId ?? 0)) {
          return reply.code(403).send({ error: '只能操作本分部的管理账户' })
        }
      }

      // 构建更新数据
      const updateData: {
        username?: string
        nickname?: string | null
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

      // nickname 允许传 null 清空，传字符串覆盖；显式 undefined 表示未传不更新
      if (nickname !== undefined) {
        updateData.nickname =
          typeof nickname === 'string' && nickname.trim().length > 0
            ? nickname.trim().slice(0, 50)
            : null
      }

      if (password !== undefined && password.length > 0) {
        updateData.passwordHash = await hashPassword(password)
      }

      // 判定最终角色（用于后续校验）
      const finalRole = role ?? account.role

      if (role !== undefined && role !== account.role) {
        // 会长可设置任意角色；超管不能设置超管/会长
        const validRoles: Role[] =
          currentUser.role === Role.HUIZHANG
            ? [Role.HUIZHANG, Role.CHAOGUAN, Role.GUANLI]
            : [Role.GUANLI]
        if (!validRoles.includes(role)) {
          return reply.code(400).send({ error: '无效的角色' })
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
        // 超管只能设置为自己授权厅之一
        if (currentUser.role === Role.CHAOGUAN) {
          if (branchId !== null && !canAccessBranch(currentUser, branchId)) {
            return reply.code(403).send({ error: '只能设置为本分部' })
          }
        }
        updateData.branchId = branchId
      }

      // 超管多厅授权：仅会长可设置，且仅对超管角色生效
      let needSyncBranches = false
      let newExtraBranchIds: number[] = []
      if (branchIds !== undefined && currentUser.role === Role.HUIZHANG && finalRole === Role.CHAOGUAN) {
        needSyncBranches = true
        newExtraBranchIds = branchIds
        // 校验额外授权厅存在
        if (newExtraBranchIds.length > 0) {
          const branches = await prisma.branch.findMany({
            where: { id: { in: newExtraBranchIds } },
            select: { id: true },
          })
          if (branches.length !== newExtraBranchIds.length) {
            return reply.code(400).send({ error: '部分授权厅不存在' })
          }
        }
      }

      // 如果角色从超管改为非超管，清除额外授权厅
      if (role !== undefined && role !== Role.CHAOGUAN && account.role === Role.CHAOGUAN) {
        needSyncBranches = true
        newExtraBranchIds = []
      }

      if (Object.keys(updateData).length === 0 && !needSyncBranches) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      const updated = await prisma.account.update({
        where: { id: accountId },
        data: updateData,
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          branchId: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
        },
      })

      // 同步额外授权厅
      if (needSyncBranches) {
        await syncAccountBranches(accountId, updated.branchId, newExtraBranchIds)
      }

      const allBranchIds = await loadAccountBranchIds(updated.id, updated.branchId)
      return reply.send({ ...updated, branchIds: allBranchIds })
    }
  )
}
