import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { Role, NotificationType } from '../../generated/prisma/client'
import { createNotification } from '../services/notification'

interface RewardRuleInput {
  sgRatio?: number
  qmRatio?: number
  rank1Reward?: number
  rank2Reward?: number
  rank3Reward?: number
  maixuThreshold?: number
  maixuReward?: number
}

function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

export default async function rewardRuleRoutes(fastify: FastifyInstance) {
  // GET /api/reward-rules - 查询奖励规则
  fastify.get(
    '/api/reward-rules',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.query as {
        branchId?: string
      }

      // 会长可查看所有，超管/管理查看自己分部
      let branchFilter: number | undefined
      if (currentUser.role === Role.HUIZHANG) {
        if (branchIdParam) {
          const n = Number(branchIdParam)
          branchFilter = Number.isNaN(n) ? undefined : n
        }
      } else {
        branchFilter = currentUser.branchId ?? undefined
      }

      const rules = await prisma.rewardRule.findMany({
        where: branchFilter ? { branchId: branchFilter } : {},
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { branchId: 'asc' },
      })

      return reply.send(rules)
    }
  )

  // PUT /api/reward-rules/:branchId - 更新奖励规则
  fastify.put(
    '/api/reward-rules/:branchId',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { branchId: branchIdParam } = request.params as {
        branchId: string
      }
      const body = request.body as Partial<RewardRuleInput>

      const branchId = Number(branchIdParam)
      if (Number.isNaN(branchId)) {
        return reply.code(400).send({ error: '无效的分部ID' })
      }

      // 超管只能更新自己分部规则（会长由 requireRole 放行）
      if (currentUser.role === Role.CHAOGUAN) {
        if (
          currentUser.branchId === null ||
          branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能更新本分部规则' })
        }
      }

      // 校验字段
      const fields: (keyof RewardRuleInput)[] = [
        'sgRatio',
        'qmRatio',
        'rank1Reward',
        'rank2Reward',
        'rank3Reward',
        'maixuThreshold',
        'maixuReward',
      ]
      const data: Record<string, number> = {}
      for (const f of fields) {
        if (body[f] !== undefined) {
          if (!isNonNegInt(body[f])) {
            return reply.code(400).send({ error: `${f} 必须为非负整数` })
          }
          data[f] = body[f] as number
        }
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      // 确认分部存在
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      })
      if (!branch) {
        return reply.code(404).send({ error: '分部不存在' })
      }

      // upsert：分部可能尚未创建规则
      const updated = await prisma.rewardRule.upsert({
        where: { branchId },
        update: data,
        create: {
          branchId,
          ...data,
        },
      })

      // 创建规则变更通知
      await createNotification(
        branchId,
        NotificationType.RULE_CHANGE,
        `分部【${branch.name}】奖励规则已更新`
      )

      return reply.send(updated)
    }
  )
}
