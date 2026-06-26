import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../middleware/auth'
import { StatCycle, Role } from '../../generated/prisma/client'
import { getWeekStart } from '../utils/week'
import { computeRanking, resolveQueryBranchId } from '../utils/welfare'
import * as xlsx from 'xlsx'

// json2csv 无 TypeScript 类型定义
const Json2CSVParser = require('json2csv').Parser

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 解析导出周期参数：MONTH=按月，其他默认按周
 */
function resolveCycleParam(cycleParam: string | undefined): StatCycle {
  return cycleParam === 'MONTH' ? StatCycle.MONTH : StatCycle.WEEK
}

export default async function exportRoutes(fastify: FastifyInstance) {
  // GET /api/export/excel - 导出Excel（支持按周/按月，仅超管及以上可访问）
  fastify.get(
    '/api/export/excel',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const cycle = resolveCycleParam(cycleParam)
      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)
      const ranking = await computeRanking(refDate, branchFilter, cycle)

      const data = ranking.map((r) => ({
        排名: r.rank,
        姓名: r.personnelName,
        分部: r.branchName,
        收光: r.sg,
        麦序: r.mx,
        全麦: r.qm,
        基础福利: r.baseWelfare,
        排名奖励: r.rankReward,
        总福利: r.totalWelfare,
      }))

      const sheetName = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const prefix = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const worksheet = xlsx.utils.json_to_sheet(data)
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName)
      const buffer = xlsx.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      })

      const filename = `${prefix}_${formatDate(refDate)}.xlsx`
      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(buffer)
    }
  )

  // GET /api/export/csv - 导出CSV（支持按周/按月，仅超管及以上可访问）
  fastify.get(
    '/api/export/csv',
    { preHandler: [authenticate, requireRole(Role.CHAOGUAN)] },
    async (request, reply) => {
      const currentUser = request.user
      const { weekStart: weekStartParam, branchId: branchIdParam, cycle: cycleParam } =
        request.query as { weekStart?: string; branchId?: string; cycle?: string }

      const cycle = resolveCycleParam(cycleParam)
      const refDate = weekStartParam ? new Date(weekStartParam) : new Date()

      const branchFilter = resolveQueryBranchId(currentUser, branchIdParam)
      const ranking = await computeRanking(refDate, branchFilter, cycle)

      const fields = [
        { label: '排名', value: 'rank' },
        { label: '姓名', value: 'personnelName' },
        { label: '分部', value: 'branchName' },
        { label: '收光', value: 'sg' },
        { label: '麦序', value: 'mx' },
        { label: '全麦', value: 'qm' },
        { label: '基础福利', value: 'baseWelfare' },
        { label: '排名奖励', value: 'rankReward' },
        { label: '总福利', value: 'totalWelfare' },
      ]

      const parser = new Json2CSVParser({ fields })
      const csv = parser.parse(ranking)

      // 添加 BOM 以便 Excel 正确识别 UTF-8 编码
      const bom = '\uFEFF'
      const prefix = cycle === StatCycle.MONTH ? '月排名' : '周排名'
      const filename = `${prefix}_${formatDate(refDate)}.csv`
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      )
      return reply.send(bom + csv)
    }
  )
}
