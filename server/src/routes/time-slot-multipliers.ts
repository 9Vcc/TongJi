import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole, canAccessBranch } from '../middleware/auth'
import { Role, NotificationType } from '../../generated/prisma/client'
import { createNotification } from '../services/notification'
import { isNonNegDecimal2 } from '../utils/validation'

// 时间段总数（0-2, 2-4, ..., 22-24，共12个）
export const SLOT_COUNT = 12

/**
 * 生成时间段标签：slotIndex 0 → "0-2", 1 → "2-4", ..., 11 → "22-24"
 */
export function slotLabel(slotIndex: number): string {
  const start = slotIndex * 2
  const end = start + 2
  return `${start}-${end === 24 ? 24 : end}`
}

interface SlotMultiplierInput {
  slotIndex: number
  multiplier: number
}

export default async function timeSlotMultiplierRoutes(fastify: FastifyInstance) {
  // GET /api/time-slot-multipliers - 查询指定厅的时间段倍率
  fastify.get(
    '/api/time-slot-multipliers',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as { branchId?: string }

      if (!branchIdParam) {
        return reply.code(400).send({ error: '缺少 branchId 参数' })
      }

      const branchId = Number(branchIdParam)
      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的 branchId' })
      }

      // 权限校验
      if (currentUser.role !== Role.HUIZHANG) {
        if (!canAccessBranch(currentUser, branchId)) {
          return reply.code(403).send({ error: '只能查看授权厅的倍率配置' })
        }
      }

      const records = await prisma.timeSlotMultiplier.findMany({
        where: { branchId },
        orderBy: { slotIndex: 'asc' },
      })

      // 补全缺失的时间段（默认倍率1）
      const recordMap = new Map(records.map((r) => [r.slotIndex, r.multiplier]))
      const result = Array.from({ length: SLOT_COUNT }, (_, i) => ({
        slotIndex: i,
        slotLabel: slotLabel(i),
        multiplier: recordMap.get(i) ?? 1,
      }))

      return reply.send(result)
    }
  )

  // PUT /api/time-slot-multipliers/:branchId - 批量更新指定厅的时间段倍率
  fastify.put(
    '/api/time-slot-multipliers/:branchId',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.params as { branchId: string }
      const body = request.body as { multipliers: SlotMultiplierInput[] }

      const branchId = Number(branchIdParam)
      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的 branchId' })
      }

      // 超管只能更新本厅规则
      if (currentUser.role === Role.CHAOGUAN) {
        if (currentUser.branchId === null || branchId !== currentUser.branchId) {
          return reply.code(403).send({ error: '只能更新本厅倍率配置' })
        }
      }

      // 校验请求体
      if (!body || !Array.isArray(body.multipliers)) {
        return reply.code(400).send({ error: 'multipliers 必须为数组' })
      }

      const inputs = body.multipliers
      const seen = new Set<number>()
      for (const item of inputs) {
        if (
          !item ||
          typeof item.slotIndex !== 'number' ||
          !Number.isInteger(item.slotIndex) ||
          item.slotIndex < 0 ||
          item.slotIndex >= SLOT_COUNT
        ) {
          return reply.code(400).send({ error: 'slotIndex 必须为 0-11 的整数' })
        }
        if (seen.has(item.slotIndex)) {
          return reply.code(400).send({ error: `slotIndex ${item.slotIndex} 重复` })
        }
        seen.add(item.slotIndex)
        if (!isNonNegDecimal2(item.multiplier)) {
          return reply.code(400).send({ error: `slotIndex ${item.slotIndex} 的倍率必须为非负数（最多两位小数）` })
        }
      }

      // 确认分部存在
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      })
      if (!branch) {
        return reply.code(404).send({ error: '分部不存在' })
      }

      // 批量 upsert
      await prisma.$transaction(
        inputs.map((item) =>
          prisma.timeSlotMultiplier.upsert({
            where: { branchId_slotIndex: { branchId, slotIndex: item.slotIndex } },
            update: { multiplier: item.multiplier },
            create: { branchId, slotIndex: item.slotIndex, multiplier: item.multiplier },
          })
        )
      )

      // 创建规则变更通知
      await createNotification(
        branchId,
        NotificationType.RULE_CHANGE,
        `分部【${branch.name}】时间段倍率已更新`
      )

      // 返回完整配置
      const records = await prisma.timeSlotMultiplier.findMany({
        where: { branchId },
        orderBy: { slotIndex: 'asc' },
      })
      const recordMap = new Map(records.map((r) => [r.slotIndex, r.multiplier]))
      const result = Array.from({ length: SLOT_COUNT }, (_, i) => ({
        slotIndex: i,
        slotLabel: slotLabel(i),
        multiplier: recordMap.get(i) ?? 1,
      }))

      return reply.send(result)
    }
  )
}
