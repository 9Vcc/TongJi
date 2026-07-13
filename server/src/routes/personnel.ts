import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch, getAccessibleBranchIds } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'

export default async function personnelRoutes(fastify: FastifyInstance) {
  // POST /api/personnel - 添加人员
  fastify.post(
    '/api/personnel',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { name, branchId } = request.body as { name: string; branchId: number }
      const currentUser = request.user

      if (!name || !branchId) {
        return reply.code(400).send({ error: '姓名和分部不能为空' })
      }

      // 超管只能添加授权厅人员
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, branchId)) {
          return reply.code(403).send({ error: '只能添加授权厅人员' })
        }
      }

      // 校验分部存在
      const branch = await prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) {
        return reply.code(400).send({ error: '分部不存在' })
      }

      // 查找同名人员（全局）
      const existing = await prisma.personnel.findFirst({ where: { name } })

      if (existing) {
        // 如果人员已属于该分部，返回错误
        const existingAssoc = await prisma.personnelBranch.findUnique({
          where: {
            personnelId_branchId: { personnelId: existing.id, branchId },
          },
        })
        if (existingAssoc) {
          return reply.code(400).send({ error: '该人员已属于此分部' })
        }
        // 同名人员已存在，只创建人员-分部关联
        await prisma.personnelBranch.create({
          data: { personnelId: existing.id, branchId },
        })
        return reply.code(201).send({
          id: existing.id,
          name: existing.name,
          createdAt: existing.createdAt,
          branchId,
        })
      }

      // 人员不存在，先创建人员再创建关联
      const personnel = await prisma.$transaction(async (tx) => {
        const p = await tx.personnel.create({ data: { name } })
        await tx.personnelBranch.create({
          data: { personnelId: p.id, branchId },
        })
        return p
      })

      return reply.code(201).send({
        id: personnel.id,
        name: personnel.name,
        createdAt: personnel.createdAt,
        branchId,
      })
    }
  )

  // POST /api/personnel/batch - 批量导入人员（按行分隔的姓名名单）
  // body: { names: string[], branchId: number }
  // 返回: { success: number, failed: number, createdPersons: string[], failures: { name: string, reason: string }[] }
  fastify.post(
    '/api/personnel/batch',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { names, branchId } = request.body as {
        names: unknown
        branchId: unknown
      }

      // 校验 branchId
      if (typeof branchId !== 'number' || !Number.isInteger(branchId) || branchId <= 0) {
        return reply.code(400).send({ error: '请指定有效的分部' })
      }
      // 校验 names 为字符串数组
      if (!Array.isArray(names)) {
        return reply.code(400).send({ error: '名单必须为字符串数组' })
      }
      // 规范化姓名：trim、去重、过滤空值
      const normalizedNames: string[] = []
      const seen = new Set<string>()
      for (const raw of names) {
        if (typeof raw !== 'string') continue
        const trimmed = raw.trim()
        if (trimmed.length === 0) continue
        if (trimmed.length > 50) {
          // 限制姓名长度
          continue
        }
        if (seen.has(trimmed)) continue
        seen.add(trimmed)
        normalizedNames.push(trimmed)
      }
      if (normalizedNames.length === 0) {
        return reply.code(400).send({ error: '名单为空或仅包含无效姓名' })
      }

      // 超管只能添加授权厅人员
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, branchId as number)) {
          return reply.code(403).send({ error: '只能添加授权厅人员' })
        }
      }

      // 校验分部存在
      const branch = await prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) {
        return reply.code(400).send({ error: '分部不存在' })
      }

      // 事务内批量处理
      const result = await prisma.$transaction(async (tx) => {
        let success = 0
        let failed = 0
        const createdPersons: string[] = []
        const failures: { name: string; reason: string }[] = []

        // 预先一次性查询所有同名人员及已存在的人员-分部关联，避免逐条 N+1 查询
        const existingPersonnel = await tx.personnel.findMany({
          where: { name: { in: normalizedNames } },
          orderBy: { id: 'asc' },
        })
        const personnelByName = new Map<string, (typeof existingPersonnel)[number]>()
        for (const p of existingPersonnel) {
          // 保留首个匹配，对齐原先 findFirst 的行为
          if (!personnelByName.has(p.name)) personnelByName.set(p.name, p)
        }
        const existingPersonnelIds = existingPersonnel.map((p) => p.id)
        const existingAssocs =
          existingPersonnelIds.length > 0
            ? await tx.personnelBranch.findMany({
                where: { personnelId: { in: existingPersonnelIds }, branchId },
                select: { personnelId: true },
              })
            : []
        const personnelInBranchSet = new Set(
          existingAssocs.map((a) => a.personnelId)
        )

        for (const name of normalizedNames) {
          try {
            const existing = personnelByName.get(name)
            if (existing) {
              // 校验是否已属于该分部（使用预取 Set）
              if (personnelInBranchSet.has(existing.id)) {
                failed++
                failures.push({ name, reason: '该人员已属于此分部' })
                continue
              }
              // 同名人员已存在，只创建关联
              await tx.personnelBranch.create({
                data: { personnelId: existing.id, branchId },
              })
              // 同步缓存，避免同名重复添加时误判
              personnelInBranchSet.add(existing.id)
              success++
              createdPersons.push(name)
              continue
            }
            // 人员不存在，创建人员 + 关联
            const p = await tx.personnel.create({ data: { name } })
            await tx.personnelBranch.create({
              data: { personnelId: p.id, branchId },
            })
            success++
            createdPersons.push(name)
          } catch (err) {
            failed++
            failures.push({
              name,
              reason: err instanceof Error ? err.message : '创建失败',
            })
          }
        }
        return { success, failed, createdPersons, failures }
      })

      return reply.code(201).send(result)
    }
  )

  // GET /api/personnel - 查询人员列表
  fastify.get(
    '/api/personnel',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId } = request.query as { branchId?: string }

      const weekStart = getWeekStart()
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      // 按月统计厅的本月范围（weekStart 归一化为当月1日）
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

      // 会长可查看所有；超管可查看指定授权厅或全部授权厅；管理查看自己分部
      let branchFilter: number | undefined
      let branchInFilter: number[] | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchId) {
          branchFilter = Number(branchId)
        }
      } else if (currentUser.role === Role.CHAOGUAN) {
        if (branchId && canAccessBranch(currentUser, Number(branchId))) {
          branchFilter = Number(branchId)
        } else {
          branchInFilter = currentUser.branchIds
        }
      } else {
        branchFilter = currentUser.branchId ?? undefined
      }

      const where = {
        ...(branchFilter
          ? { personnelBranches: { some: { branchId: branchFilter } } }
          : branchInFilter
            ? { personnelBranches: { some: { branchId: { in: branchInFilter } } } }
            : {}),
      }

      const personnel = await prisma.personnel.findMany({
        where,
        include: {
          personnelBranches: {
            include: {
              branch: { select: { id: true, name: true, statCycle: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // 收集所有涉及的 branchId，查询其 statCycle；同时查询当前周期数据记录
      // 两次查询互不依赖（branchCycleMap 仅在 JS 过滤阶段使用），并行执行
      const involvedBranchIds = new Set<number>()
      for (const p of personnel) {
        for (const pb of p.personnelBranches) {
          involvedBranchIds.add(pb.branchId)
        }
      }

      // 查询当前周期数据记录
      // 周统计厅：weekStart 在 [本周一, 下周一) 范围
      // 月统计厅：weekStart 精确匹配 [当月1日, 下月1日) 范围（数据存储时归一化为月初1日）
      const personnelIds = personnel.map((p) => p.id)
      const branchCondition = branchFilter
        ? { branchId: branchFilter }
        : branchInFilter
          ? { branchId: { in: branchInFilter } }
          : {}

      // 查询范围取并集（周 + 月），后续在 JS 中按厅 statCycle 精确过滤
      const rangeStart = weekStart < monthStart ? weekStart : monthStart
      const rangeEnd = weekEnd > nextMonthStart ? weekEnd : nextMonthStart
      const [branchList, dataRecords] = await Promise.all([
        involvedBranchIds.size > 0
          ? prisma.branch.findMany({
              where: { id: { in: Array.from(involvedBranchIds) } },
              select: { id: true, statCycle: true },
            })
          : Promise.resolve([]),
        prisma.dataRecord.findMany({
          where: {
            personnelId: { in: personnelIds },
            weekStart: { gte: rangeStart, lt: rangeEnd },
            ...branchCondition,
          },
          select: {
            id: true,
            personnelId: true,
            branchId: true,
            weekStart: true,
            sg: true,
            mx: true,
            qm: true,
          },
        }),
      ])
      const branchCycleMap = new Map<number, string>()
      for (const b of branchList) {
        branchCycleMap.set(b.id, b.statCycle)
      }

      // 按厅 statCycle 精确过滤
      const filteredRecords = dataRecords.filter((dr) => {
        const cycle = branchCycleMap.get(dr.branchId)
        if (cycle === 'MONTH') {
          // 月统计厅：weekStart 必须落在 [当月1日, 下月1日) 范围
          return dr.weekStart >= monthStart && dr.weekStart < nextMonthStart
        }
        // 周统计厅（默认）：weekStart 落在本周
        return dr.weekStart >= weekStart && dr.weekStart < weekEnd
      })

      // 按人员分组当前周期数据
      const dataByPersonnel = new Map<number, typeof filteredRecords>()
      for (const dr of filteredRecords) {
        let list = dataByPersonnel.get(dr.personnelId)
        if (!list) {
          list = []
          dataByPersonnel.set(dr.personnelId, list)
        }
        list.push(dr)
      }

      const result = personnel.map((p) => {
        const weekData = dataByPersonnel.get(p.id) ?? []
        return {
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
          branches: p.personnelBranches.map((pb) => pb.branch),
          hasDataThisWeek: weekData.length > 0,
          weekData,
        }
      })

      return reply.send(result)
    }
  )

  // PUT /api/personnel/:id - 修改人员姓名
  // 会长可修改任意人员；超管只能修改本分部人员
  fastify.put(
    '/api/personnel/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { name, branchId } = request.body as { name: string; branchId?: number }
      const currentUser = request.user

      const personnelId = Number(id)
      if (Number.isNaN(personnelId)) {
        return reply.code(400).send({ error: '无效的人员ID' })
      }

      const trimmedName = typeof name === 'string' ? name.trim() : ''
      if (!trimmedName) {
        return reply.code(400).send({ error: '姓名不能为空' })
      }
      if (trimmedName.length > 50) {
        return reply.code(400).send({ error: '姓名长度不能超过50字' })
      }

      const personnel = await prisma.personnel.findUnique({
        where: { id: personnelId },
        include: { personnelBranches: true },
      })
      if (!personnel) {
        return reply.code(404).send({ error: '人员不存在' })
      }

      // 超管只能修改授权厅人员
      if (currentUser.role === Role.CHAOGUAN) {
        const targetBranchId = branchId ?? currentUser.branchId
        if (targetBranchId === null || !canAccessBranch(currentUser, targetBranchId)) {
          return reply.code(403).send({ error: '只能修改授权厅人员' })
        }
        const assoc = personnel.personnelBranches.find(
          (pb) => pb.branchId === targetBranchId,
        )
        if (!assoc) {
          return reply.code(400).send({ error: '该人员不属于此分部' })
        }
      }

      // 校验同名人员（排除自己）
      const duplicate = await prisma.personnel.findFirst({
        where: { name: trimmedName, NOT: { id: personnelId } },
      })
      if (duplicate) {
        return reply.code(400).send({ error: '该姓名已存在' })
      }

      const updated = await prisma.personnel.update({
        where: { id: personnelId },
        data: { name: trimmedName },
      })

      return reply.send({
        id: updated.id,
        name: updated.name,
        createdAt: updated.createdAt,
      })
    },
  )

  // DELETE /api/personnel/:id - 移除人员
  fastify.delete(
    '/api/personnel/:id',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { branchId } = request.query as { branchId?: string }
      const currentUser = request.user

      const personnelId = Number(id)
      if (Number.isNaN(personnelId)) {
        return reply.code(400).send({ error: '无效的人员ID' })
      }

      if (!branchId) {
        return reply.code(400).send({ error: '请指定分部' })
      }

      const targetBranchId = Number(branchId)
      if (Number.isNaN(targetBranchId)) {
        return reply.code(400).send({ error: '无效的分部ID' })
      }

      // 超管只能操作授权厅
      if (currentUser.role === Role.CHAOGUAN) {
        if (!canAccessBranch(currentUser, targetBranchId)) {
          return reply.code(403).send({ error: '只能操作授权厅人员' })
        }
      }

      const personnel = await prisma.personnel.findUnique({
        where: { id: personnelId },
        include: {
          personnelBranches: true,
          dataRecords: { where: { branchId: targetBranchId }, select: { id: true } },
        },
      })

      if (!personnel) {
        return reply.code(404).send({ error: '人员不存在' })
      }

      // 校验关联是否存在
      const assoc = personnel.personnelBranches.find(
        (pb) => pb.branchId === targetBranchId
      )
      if (!assoc) {
        return reply.code(400).send({ error: '该人员不属于此分部' })
      }

      // 如果人员有数据记录，禁止移除
      if (personnel.dataRecords.length > 0) {
        return reply.code(400).send({ error: '该人员有数据记录，禁止移除' })
      }

      // 如果人员只属于该分部，则删除人员（先删关联再删人员）；否则只删除关联记录
      if (personnel.personnelBranches.length === 1) {
        await prisma.$transaction(async (tx) => {
          await tx.personnelBranch.deleteMany({ where: { personnelId } })
          await tx.personnel.delete({ where: { id: personnelId } })
        })
      } else {
        await prisma.personnelBranch.delete({
          where: {
            personnelId_branchId: { personnelId, branchId: targetBranchId },
          },
        })
      }

      return reply.send({ message: '人员已移除' })
    }
  )
}
