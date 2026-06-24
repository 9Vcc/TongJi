import type { FastifyInstance } from 'fastify'
import prisma, { prisma as prismaClient } from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'
import { Role, HistoryAction, Prisma } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'
import * as xlsx from 'xlsx'

interface RecordInput {
  personnelId: number
  branchId: number
  sg: number
  mx: number
  qm: number
}

function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function toNonNegInt(v: unknown): number {
  const n = Number(v)
  if (Number.isInteger(n) && n >= 0) return n
  return NaN
}

function validateRecordInput(input: Partial<RecordInput>): string | null {
  if (!input.personnelId || !input.branchId) {
    return '人员ID和分部ID不能为空'
  }
  const fields: [string, unknown][] = [
    ['sg', input.sg],
    ['mx', input.mx],
    ['qm', input.qm],
  ]
  for (const [k, v] of fields) {
    if (!isNonNegInt(v)) {
      return `${k} 必须为非负整数`
    }
  }
  return null
}

/**
 * 校验非会长用户只能操作自己分部，返回应使用的 branchId
 * 会长未指定 branchId 时返回 null（调用方需处理）
 */
function resolveBranchId(
  currentUser: { role: Role; branchId: number | null },
  requestedBranchId: number | undefined
): { ok: true; branchId: number | null } | { ok: false; error: string } {
  if (currentUser.role === Role.HUIZHANG) {
    if (requestedBranchId) return { ok: true, branchId: requestedBranchId }
    return { ok: true, branchId: null }
  }
  // 非会长：只能操作自己分部
  if (currentUser.branchId === null) {
    return { ok: false, error: '当前账户未关联分部' }
  }
  if (requestedBranchId && requestedBranchId !== currentUser.branchId) {
    return { ok: false, error: '只能操作本分部数据' }
  }
  return { ok: true, branchId: currentUser.branchId }
}

/**
 * 同一人员同一周同一分部只能有一条记录，已存在则累加
 */
async function upsertRecord(
  client: Prisma.TransactionClient,
  input: RecordInput,
  createdBy: number,
  weekStart: Date
) {
  const existing = await client.dataRecord.findFirst({
    where: {
      personnelId: input.personnelId,
      branchId: input.branchId,
      weekStart,
    },
  })
  if (existing) {
    return client.dataRecord.update({
      where: { id: existing.id },
      data: {
        sg: existing.sg + input.sg,
        mx: existing.mx + input.mx,
        qm: existing.qm + input.qm,
      },
    })
  }
  return client.dataRecord.create({
    data: {
      personnelId: input.personnelId,
      branchId: input.branchId,
      weekStart,
      sg: input.sg,
      mx: input.mx,
      qm: input.qm,
      createdBy,
    },
  })
}

/**
 * 校验人员属于指定分部，返回人员ID
 */
async function findPersonnelInBranch(name: string, branchId: number) {
  const pb = await prisma.personnelBranch.findFirst({
    where: { branchId, personnel: { name } },
    include: { personnel: true },
  })
  return pb?.personnelId ?? null
}

export default async function dataRecordRoutes(fastify: FastifyInstance) {
  // POST /api/data-records - 手动录入（单条和批量）
  fastify.post(
    '/api/data-records',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const currentUser = request.user
      const body = request.body as Record<string, unknown>
      const weekStart = getWeekStart()

      // 批量录入
      if (Array.isArray(body.records)) {
        const inputs = body.records as Partial<RecordInput>[]
        if (inputs.length === 0) {
          return reply.code(400).send({ error: '记录列表不能为空' })
        }

        // 先统一校验
        for (let i = 0; i < inputs.length; i++) {
          const err = validateRecordInput(inputs[i])
          if (err) {
            return reply.code(400).send({ error: `第${i + 1}条记录：${err}` })
          }
        }

        // 校验分部权限与人员归属
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as RecordInput
          const resolved = resolveBranchId(currentUser, input.branchId)
          if (!resolved.ok) {
            return reply.code(403).send({ error: `第${i + 1}条记录：${resolved.error}` })
          }
          if (resolved.branchId === null) {
            return reply.code(400).send({ error: `第${i + 1}条记录：请指定分部` })
          }
          input.branchId = resolved.branchId

          const assoc = await prisma.personnelBranch.findUnique({
            where: {
              personnelId_branchId: {
                personnelId: input.personnelId,
                branchId: input.branchId,
              },
            },
          })
          if (!assoc) {
            return reply
              .code(400)
              .send({ error: `第${i + 1}条记录：人员不属于该分部` })
          }
        }

        const created = await prismaClient.$transaction(async (tx) => {
          const results = []
          for (const input of inputs as RecordInput[]) {
            const rec = await upsertRecord(tx, input, currentUser.id, weekStart)
            results.push(rec)
          }
          return results
        })

        return reply.code(201).send(created)
      }

      // 单条录入
      const input = body as Partial<RecordInput>
      const err = validateRecordInput(input)
      if (err) {
        return reply.code(400).send({ error: err })
      }

      const resolved = resolveBranchId(currentUser, input.branchId)
      if (!resolved.ok) {
        return reply.code(403).send({ error: resolved.error })
      }
      if (resolved.branchId === null) {
        return reply.code(400).send({ error: '请指定分部' })
      }
      input.branchId = resolved.branchId

      const assoc = await prisma.personnelBranch.findUnique({
        where: {
          personnelId_branchId: {
            personnelId: input.personnelId!,
            branchId: input.branchId,
          },
        },
      })
      if (!assoc) {
        return reply.code(400).send({ error: '人员不属于该分部' })
      }

      const record = await upsertRecord(
        prismaClient as unknown as Prisma.TransactionClient,
        input as RecordInput,
        currentUser.id,
        weekStart
      )
      return reply.code(201).send(record)
    }
  )

  // POST /api/data-records/import-excel - Excel导入
  fastify.post(
    '/api/data-records/import-excel',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const currentUser = request.user

      // 遍历所有部分，收集文件与 branchId 字段
      let fileBuffer: Buffer | null = null
      let requestedBranchId: number | undefined
      const parts = request.parts()
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            fileBuffer = await part.toBuffer()
          }
        } else if (part.type === 'field') {
          if (part.fieldname === 'branchId') {
            requestedBranchId = Number(part.value)
          }
        }
      }

      if (!fileBuffer) {
        return reply.code(400).send({ error: '未上传文件' })
      }

      const resolved = resolveBranchId(currentUser, requestedBranchId)
      if (!resolved.ok) {
        return reply.code(403).send({ error: resolved.error })
      }
      const branchId = resolved.branchId
      if (branchId === null) {
        return reply.code(400).send({ error: '请指定分部' })
      }

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) {
        return reply.code(400).send({ error: 'Excel文件无有效工作表' })
      }
      const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
      })

      const weekStart = getWeekStart()
      let success = 0
      let failed = 0
      const failures: { row: number; name: string; reason: string }[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        const name = String(row[0] ?? '').trim()
        if (!name) continue
        const sg = toNonNegInt(row[1])
        const mx = toNonNegInt(row[2])
        const qm = toNonNegInt(row[3])

        if (Number.isNaN(sg) || Number.isNaN(mx) || Number.isNaN(qm)) {
          failed++
          failures.push({ row: i + 1, name, reason: '收光/麦序/全麦必须为非负整数' })
          continue
        }

        const personnelId = await findPersonnelInBranch(name, branchId)
        if (!personnelId) {
          failed++
          failures.push({ row: i + 1, name, reason: '分部内未找到该人员' })
          continue
        }

        try {
          await upsertRecord(
            prismaClient as unknown as Prisma.TransactionClient,
            { personnelId, branchId, sg, mx, qm },
            currentUser.id,
            weekStart
          )
          success++
        } catch {
          failed++
          failures.push({ row: i + 1, name, reason: '录入失败' })
        }
      }

      return reply.send({ success, failed, failures })
    }
  )

  // POST /api/data-records/import-paste - 表格粘贴导入
  fastify.post(
    '/api/data-records/import-paste',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const currentUser = request.user
      const { data, branchId: requestedBranchId } = request.body as {
        data: string
        branchId?: number
      }

      if (!data) {
        return reply.code(400).send({ error: '数据不能为空' })
      }

      const resolved = resolveBranchId(currentUser, requestedBranchId)
      if (!resolved.ok) {
        return reply.code(403).send({ error: resolved.error })
      }
      const branchId = resolved.branchId
      if (branchId === null) {
        return reply.code(400).send({ error: '请指定分部' })
      }

      const weekStart = getWeekStart()
      let success = 0
      let failed = 0
      const failures: { row: number; name: string; reason: string }[] = []

      const lines = data
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // 跳过表头行
        if (i === 0 && line.includes('姓名')) continue

        const parts = line.includes('\t') ? line.split('\t') : line.split(',')
        const name = (parts[0] ?? '').trim()
        if (!name) continue
        const sg = toNonNegInt(parts[1])
        const mx = toNonNegInt(parts[2])
        const qm = toNonNegInt(parts[3])

        if (Number.isNaN(sg) || Number.isNaN(mx) || Number.isNaN(qm)) {
          failed++
          failures.push({ row: i + 1, name, reason: '收光/麦序/全麦必须为非负整数' })
          continue
        }

        const personnelId = await findPersonnelInBranch(name, branchId)
        if (!personnelId) {
          failed++
          failures.push({ row: i + 1, name, reason: '分部内未找到该人员' })
          continue
        }

        try {
          await upsertRecord(
            prismaClient as unknown as Prisma.TransactionClient,
            { personnelId, branchId, sg, mx, qm },
            currentUser.id,
            weekStart
          )
          success++
        } catch {
          failed++
          failures.push({ row: i + 1, name, reason: '录入失败' })
        }
      }

      return reply.send({ success, failed, failures })
    }
  )

  // PUT /api/data-records/:id - 修改数据
  fastify.put(
    '/api/data-records/:id',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user
      const body = request.body as { sg?: number; mx?: number; qm?: number }

      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const record = await prisma.dataRecord.findUnique({
        where: { id: recordId },
      })
      if (!record) {
        return reply.code(404).send({ error: '记录不存在' })
      }

      // 非会长只能修改本分部
      if (currentUser.role !== Role.HUIZHANG) {
        if (
          currentUser.branchId === null ||
          record.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能修改本分部数据' })
        }
      }

      // 校验字段合法性
      const updates: { field: 'sg' | 'mx' | 'qm'; value: number }[] = []
      for (const field of ['sg', 'mx', 'qm'] as const) {
        if (body[field] !== undefined) {
          if (!isNonNegInt(body[field])) {
            return reply.code(400).send({ error: `${field} 必须为非负整数` })
          }
          updates.push({ field, value: body[field] as number })
        }
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: '没有需要更新的字段' })
      }

      // 记录修改历史并更新
      const updated = await prismaClient.$transaction(async (tx) => {
        for (const { field, value } of updates) {
          const oldValue = record[field]
          if (oldValue === value) continue
          await tx.dataHistory.create({
            data: {
              recordId: record.id,
              modifierId: currentUser.id,
              action: HistoryAction.UPDATE,
              field,
              oldValue: String(oldValue),
              newValue: String(value),
            },
          })
        }
        return tx.dataRecord.update({
          where: { id: record.id },
          data: {
            sg: body.sg ?? undefined,
            mx: body.mx ?? undefined,
            qm: body.qm ?? undefined,
          },
        })
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/data-records/:id - 删除数据
  fastify.delete(
    '/api/data-records/:id',
    { preHandler: [authenticate, requireRole(Role.HUIZHANG, Role.CHAOGUAN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user

      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const record = await prisma.dataRecord.findUnique({
        where: { id: recordId },
      })
      if (!record) {
        return reply.code(404).send({ error: '记录不存在' })
      }

      // 超管只能删除本分部数据（会长不限）
      if (currentUser.role === Role.CHAOGUAN) {
        if (
          currentUser.branchId === null ||
          record.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能删除本分部数据' })
        }
      }

      // 记录删除操作到历史，然后删除记录
      await prismaClient.$transaction(async (tx) => {
        await tx.dataHistory.create({
          data: {
            recordId: record.id,
            modifierId: currentUser.id,
            action: HistoryAction.DELETE,
            field: null,
            oldValue: JSON.stringify({
              personnelId: record.personnelId,
              branchId: record.branchId,
              weekStart: record.weekStart,
              sg: record.sg,
              mx: record.mx,
              qm: record.qm,
            }),
            newValue: null,
          },
        })
        await tx.dataRecord.delete({ where: { id: record.id } })
      })

      return reply.send({ message: '记录已删除' })
    }
  )

  // GET /api/data-records/:id/history - 查询修改历史
  fastify.get(
    '/api/data-records/:id/history',
    { preHandler: [authenticate, requireRole(Role.GUANLI)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const currentUser = request.user

      const recordId = Number(id)
      if (Number.isNaN(recordId)) {
        return reply.code(400).send({ error: '无效的记录ID' })
      }

      const record = await prisma.dataRecord.findUnique({
        where: { id: recordId },
      })
      if (!record) {
        return reply.code(404).send({ error: '记录不存在' })
      }

      // 非会长只能查看本分部
      if (currentUser.role !== Role.HUIZHANG) {
        if (
          currentUser.branchId === null ||
          record.branchId !== currentUser.branchId
        ) {
          return reply.code(403).send({ error: '只能查看本分部数据' })
        }
      }

      const histories = await prisma.dataHistory.findMany({
        where: { recordId },
        include: {
          modifier: { select: { id: true, username: true } },
        },
        orderBy: { modifyTime: 'desc' },
      })

      return reply.send(histories)
    }
  )
}
