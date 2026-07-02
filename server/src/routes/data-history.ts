import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch, getAccessibleBranchIds } from '../middleware/auth'
import { Role } from '../../generated/prisma/client'
import type { HistoryAction } from '../../generated/prisma/client'

/**
 * 录入历史记录路由
 * 提供：创建记录列表 + 修改/删除历史列表
 * 仅会长、超管可见
 */
export default async function dataHistoryRoutes(fastify: FastifyInstance) {
  // GET /api/data-history - 综合查询录入与修改历史
  // 查询参数：date?(YYYY-MM-DD 按操作日期过滤), weekStart?, branchId?, personnelId?, modifierId?, type?(create|update|delete)
  fastify.get(
    '/api/data-history',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const query = request.query as {
        weekStart?: string
        date?: string
        branchId?: string
        personnelId?: string
        modifierId?: string
        type?: 'create' | 'update' | 'delete'
        limit?: string
      }

      // 解析 date 参数为当天的起止时间范围 [start, end)
      let dayRange: { start: Date; end: Date } | null = null
      if (query.date) {
        const d = new Date(query.date)
        if (!Number.isNaN(d.getTime())) {
          const start = new Date(d)
          start.setHours(0, 0, 0, 0)
          const end = new Date(start)
          end.setDate(end.getDate() + 1)
          dayRange = { start, end }
        }
      }

      // 构建通用 where
      const where: {
        weekStart?: Date
        branchId?: number
        personnelId?: number
        createdBy?: number
        createdAt?: { gte: Date; lt: Date }
      } = {}

      if (query.weekStart) {
        where.weekStart = new Date(query.weekStart)
      }
      if (dayRange) {
        where.createdAt = { gte: dayRange.start, lt: dayRange.end }
      }
      if (query.branchId) {
        const bid = Number(query.branchId)
        if (!Number.isNaN(bid)) where.branchId = bid
      }
      if (query.personnelId) {
        const pid = Number(query.personnelId)
        if (!Number.isNaN(pid)) where.personnelId = pid
      }

      // 超管可查看指定授权厅或全部授权厅；管理仅本厅
      let branchScope: number | undefined
      let branchInScope: number[] | undefined
      if (currentUser.role === Role.CHAOGUAN) {
        if (query.branchId && canAccessBranch(currentUser, Number(query.branchId))) {
          branchScope = Number(query.branchId)
        } else {
          branchInScope = currentUser.branchIds
        }
      } else {
        branchScope = query.branchId ? Number(query.branchId) : undefined
      }

      const limit = Math.min(Number(query.limit) || 100, 500)

      // 统一日志项结构
      type LogItem = {
        id: number
        type: 'create' | 'update' | 'delete'
        time: Date
        personnelId: number
        personnelName: string
        branchId: number
        branchName: string
        weekStart: Date
        operatorId: number
        operatorName: string
        action?: HistoryAction
        field?: string | null
        oldValue?: string | null
        newValue?: string | null
        recordId: number | null
        // 创建/当前记录的数值（type=create 时使用）
        sg?: number
        mx?: number
        qm?: number
        zcDays?: number
        // 备注信息（DataRecord.remark 或 DataHistory.remark）
        remark?: string | null
      }

      // 取录入历史记录（从 DataHistory action=CREATE 查询，每次录入独立一条）
      if (!query.type || query.type === 'create') {
        const createHistoryWhere: {
          action: HistoryAction
          modifierId?: number
          modifyTime?: { gte: Date; lt: Date }
          record?: {
            weekStart?: Date
            branchId?: number | { in: number[] }
            personnelId?: number
          }
        } = { action: 'CREATE' }
        if (query.modifierId) {
          createHistoryWhere.modifierId = Number(query.modifierId)
        }
        // date 参数：按录入操作的 modifyTime 过滤当天
        if (dayRange) {
          createHistoryWhere.modifyTime = { gte: dayRange.start, lt: dayRange.end }
        }
        if (query.weekStart || query.personnelId || branchScope || (branchInScope && branchInScope.length > 0)) {
          createHistoryWhere.record = {}
          if (query.weekStart) {
            createHistoryWhere.record.weekStart = new Date(query.weekStart)
          }
          if (query.personnelId) {
            createHistoryWhere.record.personnelId = Number(query.personnelId)
          }
          if (currentUser.role === Role.CHAOGUAN) {
            if (branchScope) {
              createHistoryWhere.record.branchId = branchScope
            } else if (branchInScope && branchInScope.length > 0) {
              createHistoryWhere.record.branchId = { in: branchInScope }
            }
          } else if (branchScope) {
            createHistoryWhere.record.branchId = branchScope
          }
        }

        const createHistories = await prisma.dataHistory.findMany({
          where: createHistoryWhere,
          include: {
            record: {
              include: {
                personnel: true,
                branch: true,
              },
            },
            modifier: { select: { id: true, username: true } },
          },
          orderBy: { modifyTime: 'desc' },
          take: limit,
        })

        // 解析 newValue JSON 还原本次录入的增量值
        const createItems: LogItem[] = createHistories.map((h) => {
          let parsedNew: { sg?: number; mx?: number; qm?: number; zcDays?: number } = {}
          try {
            parsedNew = JSON.parse(h.newValue || '{}')
          } catch {
            parsedNew = {}
          }
          return {
            id: h.id,
            type: 'create' as const,
            time: h.modifyTime,
            personnelId: h.record?.personnelId ?? 0,
            personnelName: h.record?.personnel.name ?? '(已删除记录)',
            branchId: h.record?.branchId ?? 0,
            branchName: h.record?.branch.name ?? '-',
            weekStart: h.record?.weekStart ?? h.modifyTime,
            operatorId: h.modifierId,
            operatorName: h.modifier.username,
            recordId: h.recordId,
            sg: parsedNew.sg,
            mx: parsedNew.mx,
            qm: parsedNew.qm,
            zcDays: parsedNew.zcDays,
            remark: h.remark,
          }
        })

        // 若只要 create 类型，直接返回
        if (query.type === 'create') {
          return reply.send(createItems)
        }

        // 否则合并修改/删除历史
        const historyWhere: {
          modifierId?: number
          modifyTime?: { gte: Date; lt: Date }
          record?: {
            weekStart?: Date
            branchId?: number | { in: number[] }
            personnelId?: number
          }
          action: { not: 'CREATE' }
        } = { action: { not: 'CREATE' } }
        if (query.modifierId) {
          historyWhere.modifierId = Number(query.modifierId)
        }
        // date 参数：按修改/删除操作的 modifyTime 过滤当天
        if (dayRange) {
          historyWhere.modifyTime = { gte: dayRange.start, lt: dayRange.end }
        }
        if (query.weekStart || query.personnelId || branchScope || (branchInScope && branchInScope.length > 0)) {
          historyWhere.record = {}
          if (query.weekStart) {
            historyWhere.record.weekStart = new Date(query.weekStart)
          }
          if (query.personnelId) {
            historyWhere.record.personnelId = Number(query.personnelId)
          }
          if (currentUser.role === Role.CHAOGUAN) {
            if (branchScope) {
              historyWhere.record.branchId = branchScope
            } else if (branchInScope && branchInScope.length > 0) {
              historyWhere.record.branchId = { in: branchInScope }
            }
          } else if (branchScope) {
            historyWhere.record.branchId = branchScope
          }
        }

        const histories = await prisma.dataHistory.findMany({
          where: historyWhere,
          include: {
            record: {
              include: {
                personnel: true,
                branch: true,
              },
            },
            modifier: { select: { id: true, username: true } },
          },
          orderBy: { modifyTime: 'desc' },
          take: limit,
        })

        const historyItems: LogItem[] = histories.map((h) => ({
          id: h.id,
          type: h.action === 'DELETE' ? 'delete' : 'update',
          time: h.modifyTime,
          personnelId: h.record?.personnelId ?? 0,
          personnelName: h.record?.personnel.name ?? '(已删除记录)',
          branchId: h.record?.branchId ?? 0,
          branchName: h.record?.branch.name ?? '-',
          weekStart: h.record?.weekStart ?? h.modifyTime,
          operatorId: h.modifierId,
          operatorName: h.modifier.username,
          action: h.action,
          field: h.field,
          oldValue: h.oldValue,
          newValue: h.newValue,
          recordId: h.recordId,
          remark: h.remark,
        }))

        // 合并并按时间倒序
        const merged = [...createItems, ...historyItems].sort(
          (a, b) => b.time.getTime() - a.time.getTime()
        )
        return reply.send(merged.slice(0, limit))
      }

      // 仅 update/delete 类型
      const historyWhere: {
        modifierId?: number
        modifyTime?: { gte: Date; lt: Date }
        record?: {
          weekStart?: Date
          branchId?: number
          personnelId?: number
        }
        action: HistoryAction
      } = { action: 'UPDATE' }
      if (query.type === 'delete') {
        historyWhere.action = 'DELETE'
      }
      if (query.modifierId) {
        historyWhere.modifierId = Number(query.modifierId)
      }
      // date 参数：按修改/删除操作的 modifyTime 过滤当天
      if (dayRange) {
        historyWhere.modifyTime = { gte: dayRange.start, lt: dayRange.end }
      }
      if (query.weekStart || query.personnelId || branchScope || (branchInScope && branchInScope.length > 0)) {
        historyWhere.record = {}
        if (query.weekStart) {
          historyWhere.record.weekStart = new Date(query.weekStart)
        }
        if (query.personnelId) {
          historyWhere.record.personnelId = Number(query.personnelId)
        }
        if (currentUser.role === Role.CHAOGUAN && currentUser.branchId) {
          historyWhere.record.branchId = currentUser.branchId
        } else if (branchScope) {
          historyWhere.record.branchId = branchScope
        }
      }

      const histories = await prisma.dataHistory.findMany({
        where: historyWhere,
        include: {
          record: {
            include: {
              personnel: true,
              branch: true,
            },
          },
          modifier: { select: { id: true, username: true } },
        },
        orderBy: { modifyTime: 'desc' },
        take: limit,
      })

      const items: LogItem[] = histories.map((h) => ({
        id: h.id,
        type: h.action === 'DELETE' ? 'delete' : 'update',
        time: h.modifyTime,
        personnelId: h.record?.personnelId ?? 0,
        personnelName: h.record?.personnel.name ?? '(已删除记录)',
        branchId: h.record?.branchId ?? 0,
        branchName: h.record?.branch.name ?? '-',
        weekStart: h.record?.weekStart ?? h.modifyTime,
        operatorId: h.modifierId,
        operatorName: h.modifier.username,
        action: h.action,
        field: h.field,
        oldValue: h.oldValue,
        newValue: h.newValue,
        recordId: h.recordId,
        remark: h.remark,
      }))

      return reply.send(items)
    }
  )
}
