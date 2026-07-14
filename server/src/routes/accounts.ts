import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch, invalidateAuthCache } from '../middleware/auth'
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
 * 加载账户的所有授权合厅组 ID 列表
 */
async function loadAccountGroupIds(accountId: number): Promise<number[]> {
  const groups = await prisma.accountGroup.findMany({
    where: { accountId },
    select: { groupId: true },
  })
  return groups.map((ag) => ag.groupId)
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

/**
 * 同步超管的授权合厅组（删除旧记录，创建新记录）
 * groupIds 为完整授权合厅组列表
 */
async function syncAccountGroups(accountId: number, groupIds: number[]): Promise<void> {
  await prisma.accountGroup.deleteMany({ where: { accountId } })
  const uniqueIds = [...new Set(groupIds.filter((id) => id > 0))]
  if (uniqueIds.length > 0) {
    await prisma.accountGroup.createMany({
      data: uniqueIds.map((gid) => ({ accountId, groupId: gid })),
    })
  }
}

export default async function accountRoutes(fastify: FastifyInstance) {
  // POST /api/accounts - 添加账户
  fastify.post(
    '/api/accounts',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { username, password, role, branchId, nickname, branchIds, groupIds, mainGroupId } = request.body as {
        username: string
        password: string
        role: Role
        branchId?: number
        nickname?: string
        branchIds?: number[]
        groupIds?: number[]
        mainGroupId?: number | null
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
      let targetGroupIds: number[] = []
      let targetMainGroupId: number | null = null

      if (currentUser.role === Role.HUIZHANG) {
        // 会长添加会长时可不绑定分部
        if (role === Role.HUIZHANG) {
          targetBranchId = branchId ?? null
        }
        // 会长添加超管/管理时需指定 branchId 或 mainGroupId
        if (role === Role.CHAOGUAN || role === Role.GUANLI) {
          // 超管的主厅可以是合厅组（mainGroupId），此时 branchId 可为 null
          if (role === Role.CHAOGUAN && mainGroupId) {
            targetMainGroupId = mainGroupId
            targetBranchId = branchId ?? null
            // 确保主合厅组在授权列表中
            if (!groupIds || !groupIds.includes(mainGroupId)) {
              targetGroupIds = [...(groupIds ?? []), mainGroupId]
            } else {
              targetGroupIds = groupIds
            }
          } else {
            if (!branchId) {
              return reply.code(400).send({ error: '请指定分部' })
            }
            targetBranchId = branchId
          }
          // 超管支持多厅授权
          if (role === Role.CHAOGUAN && branchIds && branchIds.length > 0) {
            targetExtraBranchIds = branchIds
          }
          // 超管支持合厅组授权
          if (role === Role.CHAOGUAN && targetGroupIds.length === 0 && groupIds && groupIds.length > 0) {
            targetGroupIds = groupIds
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

      // 校验授权合厅组存在
      if (targetGroupIds.length > 0) {
        const groups = await prisma.branchGroup.findMany({
          where: { id: { in: targetGroupIds } },
          select: { id: true },
        })
        if (groups.length !== targetGroupIds.length) {
          return reply.code(400).send({ error: '部分合厅组不存在' })
        }
      }

      // 校验主合厅组存在
      if (targetMainGroupId) {
        const group = await prisma.branchGroup.findUnique({ where: { id: targetMainGroupId } })
        if (!group) {
          return reply.code(400).send({ error: '主合厅组不存在' })
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
          mainGroupId: targetMainGroupId,
        },
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          branchId: true,
          mainGroupId: true,
          status: true,
          createdAt: true,
        },
      })

      // 超管：创建额外授权厅关联
      if (role === Role.CHAOGUAN && targetExtraBranchIds.length > 0) {
        await syncAccountBranches(account.id, targetBranchId, targetExtraBranchIds)
      }

      // 超管：创建授权合厅组关联
      if (role === Role.CHAOGUAN && targetGroupIds.length > 0) {
        await syncAccountGroups(account.id, targetGroupIds)
      }

      const allBranchIds = await loadAccountBranchIds(account.id, account.branchId)
      const allGroupIds = await loadAccountGroupIds(account.id)
      // 查询主合厅组信息（若存在）
      const mainGroup = account.mainGroupId
        ? await prisma.branchGroup.findUnique({
            where: { id: account.mainGroupId },
            select: { id: true, name: true },
          })
        : null
      return reply.code(201).send({ ...account, branchIds: allBranchIds, groupIds: allGroupIds, mainGroup })
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
          mainGroupId: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
          mainGroup: { select: { id: true, name: true } },
          accountBranches: { select: { branchId: true, branch: { select: { id: true, name: true } } } },
          accountGroups: { select: { groupId: true, group: { select: { id: true, name: true } } } },
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
        const groupIds = a.accountGroups.map((ag) => ag.groupId)
        const groups = a.accountGroups.map((ag) => ag.group)
        return {
          id: a.id,
          username: a.username,
          nickname: a.nickname,
          role: a.role,
          branchId: a.branchId,
          mainGroupId: a.mainGroupId,
          mainGroup: a.mainGroup,
          branchIds: allBranchIds,
          groupIds,
          status: a.status,
          createdAt: a.createdAt,
          branch: a.branch,
          branches: allBranches,
          groups,
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

      // 状态变更后失效该账户的授权厅缓存
      invalidateAuthCache(accountId)

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

      // 删除账户后失效该账户的授权厅缓存
      invalidateAuthCache(accountId)

      return reply.send({ message: '账户已删除' })
    }
  )

  // PUT /api/accounts/:id - 更新账户（用户名、密码、角色、分部、授权厅）
  fastify.put(
    '/api/accounts/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { username, password, role, branchId, nickname, branchIds, groupIds, mainGroupId } = request.body as {
        username?: string
        password?: string
        role?: Role
        branchId?: number | null
        nickname?: string | null
        branchIds?: number[]
        groupIds?: number[]
        mainGroupId?: number | null
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
        mainGroupId?: number | null
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

      // 超管合厅组授权：仅会长可设置，且仅对超管角色生效
      let needSyncGroups = false
      let newGroupIds: number[] = []
      if (groupIds !== undefined && currentUser.role === Role.HUIZHANG && finalRole === Role.CHAOGUAN) {
        needSyncGroups = true
        newGroupIds = groupIds
        // 校验授权合厅组存在
        if (newGroupIds.length > 0) {
          const groups = await prisma.branchGroup.findMany({
            where: { id: { in: newGroupIds } },
            select: { id: true },
          })
          if (groups.length !== newGroupIds.length) {
            return reply.code(400).send({ error: '部分合厅组不存在' })
          }
        }
      }

      // 如果角色从超管改为非超管，清除授权合厅组
      if (role !== undefined && role !== Role.CHAOGUAN && account.role === Role.CHAOGUAN) {
        needSyncGroups = true
        newGroupIds = []
      }

      // 主合厅组设置：仅会长可设置，且仅对超管角色生效
      // mainGroupId 为 null 表示清除主合厅组；为数字表示设置主合厅组
      if (mainGroupId !== undefined && currentUser.role === Role.HUIZHANG && finalRole === Role.CHAOGUAN) {
        if (mainGroupId !== null) {
          // 校验主合厅组存在
          const group = await prisma.branchGroup.findUnique({ where: { id: mainGroupId } })
          if (!group) {
            return reply.code(400).send({ error: '主合厅组不存在' })
          }
          // 确保主合厅组在授权合厅组列表中
          if (!newGroupIds.includes(mainGroupId)) {
            newGroupIds = [...newGroupIds, mainGroupId]
            needSyncGroups = true
          }
        }
        if (mainGroupId !== account.mainGroupId) {
          updateData.mainGroupId = mainGroupId
        }
      }

      // 如果角色从超管改为非超管，清除主合厅组
      if (role !== undefined && role !== Role.CHAOGUAN && account.role === Role.CHAOGUAN) {
        if (account.mainGroupId !== null) {
          updateData.mainGroupId = null
        }
      }

      if (Object.keys(updateData).length === 0 && !needSyncBranches && !needSyncGroups) {
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
          mainGroupId: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
          mainGroup: { select: { id: true, name: true } },
        },
      })

      // 同步额外授权厅
      if (needSyncBranches) {
        await syncAccountBranches(accountId, updated.branchId, newExtraBranchIds)
      }

      // 同步授权合厅组
      if (needSyncGroups) {
        await syncAccountGroups(accountId, newGroupIds)
      }

      // 账户信息变更后失效该账户的授权缓存（角色/主厅/额外授权厅/合厅组/主合厅组可能已变）
      invalidateAuthCache(accountId)

      const allBranchIds = await loadAccountBranchIds(updated.id, updated.branchId)
      const allGroupIds = await loadAccountGroupIds(updated.id)
      return reply.send({ ...updated, branchIds: allBranchIds, groupIds: allGroupIds })
    }
  )
}
