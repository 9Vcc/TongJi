import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { History, Filter, RefreshCw, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  dataHistoryApi,
  branchesApi,
  personnelApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { Skeleton } from '../../components/Skeleton'
import SubPageHeader from '../../components/SubPageHeader'
import SearchableSelect from '../../components/SearchableSelect'
import { formatDateTime, getWeekRangeText } from '../../utils'
import type { Branch, Personnel, DataLogItem, DataLogType } from '../../types'

// 类型显示映射
const TYPE_MAP: Record<
  DataLogType,
  { label: string; cls: string; icon: typeof Plus }
> = {
  create: {
    label: '录入',
    cls: 'bg-success/10 text-success',
    icon: Plus,
  },
  update: {
    label: '修改',
    cls: 'bg-warning/10 text-warning',
    icon: Pencil,
  },
  delete: {
    label: '删除',
    cls: 'bg-danger/10 text-danger',
    icon: Trash2,
  },
}

// 字段中文名映射
const FIELD_MAP: Record<string, string> = {
  sg: '收光',
  mx: '麦序',
  qm: '全麦',
  personnelId: '人员',
}

export default function DataHistoryPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canView = isHuizhang || isChaoguan

  const [logs, setLogs] = useState<DataLogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])

  // 筛选条件
  const [filterType, setFilterType] = useState<DataLogType | ''>('')
  const [filterDate, setFilterDate] = useState('')
  const [filterBranchId, setFilterBranchId] = useState('')
  const [filterPersonnelId, setFilterPersonnelId] = useState('')

  // 分页：每页 50 条
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  // 标记：人员选中时自动设置的 branchId，避免触发清空 personnelId
  const autoBranchRef = useRef(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof dataHistoryApi.list>[0] = {}
      if (filterType) params.type = filterType
      if (filterDate) params.date = filterDate
      if (filterBranchId) params.branchId = Number(filterBranchId)
      if (filterPersonnelId) params.personnelId = Number(filterPersonnelId)
      // 拉取最多 500 条用于前端分页（后端上限 500）
      params.limit = 500
      const list = await dataHistoryApi.list(params)
      setLogs(list)
      // 数据刷新后重置到第 1 页
      setCurrentPage(1)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载：厅列表、人员列表（人员只加载一次，便于反向搜索：人员 → 厅）
  useEffect(() => {
    if (!canView) return
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
    // 会长不传 branchId 加载所有人员；超管/管理后端自动限定本厅
    personnelApi.list().then(setPersonnel).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, isHuizhang])

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (!canView) return
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterDate, filterBranchId, filterPersonnelId])

  // 厅变化时：若是用户手动改厅则清空人员（自动设置跳过）
  useEffect(() => {
    if (autoBranchRef.current) {
      autoBranchRef.current = false
      return
    }
    setFilterPersonnelId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBranchId])

  // 人员选中：自动定位到该人员所在厅（会长场景）
  const handlePersonnelChange = (v: string) => {
    setFilterPersonnelId(v)
    if (v && isHuizhang) {
      const p = personnel.find((x) => x.id === Number(v))
      const firstBranch = p?.branches?.[0]
      if (firstBranch) {
        // 若当前厅与人员所在厅不同，自动切换并标记跳过清空
        if (String(firstBranch.id) !== filterBranchId) {
          autoBranchRef.current = true
          setFilterBranchId(String(firstBranch.id))
        }
      }
    }
  }

  // 重置筛选
  const handleReset = () => {
    setFilterType('')
    setFilterDate('')
    setFilterBranchId('')
    setFilterPersonnelId('')
  }

  if (!canView) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  const hasFilter =
    filterType || filterDate || filterBranchId || filterPersonnelId

  // 人员 ID → 名称映射，用于 personnelId 字段变更时的友好显示
  const personnelMap = useMemo(() => {
    const m = new Map<number, string>()
    personnel.forEach((p) => m.set(p.id, p.name))
    return m
  }, [personnel])

  // 人员搜索选项
  const personnelOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [personnel]
  )

  // 分页切片：当前页应显示的记录
  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pagedLogs = useMemo(
    () => logs.slice((safePage - 1) * pageSize, safePage * pageSize),
    [logs, safePage]
  )

  // 渲染详情文本
  const renderDetail = (log: DataLogItem): string => {
    // 录入：直接显示数值
    if (log.type === 'create') {
      return `收光 ${log.sg ?? 0} · 麦序 ${log.mx ?? 0} · 全麦 ${log.qm ?? 0}`
    }
    // 删除：oldValue 存储的是原始记录 JSON，解析后友好展示
    if (log.type === 'delete') {
      try {
        const parsed = JSON.parse(log.oldValue || '{}') as {
          sg?: number
          mx?: number
          qm?: number
        }
        return `删除前数据：收光 ${parsed.sg ?? 0} · 麦序 ${parsed.mx ?? 0} · 全麦 ${parsed.qm ?? 0}`
      } catch {
        return log.oldValue || '-'
      }
    }
    // 修改：personnelId 字段特殊处理（ID → 人员名）
    if (log.field === 'personnelId') {
      const oldId = Number(log.oldValue)
      const newId = Number(log.newValue)
      const oldName = personnelMap.get(oldId) || `ID:${oldId}`
      const newName = personnelMap.get(newId) || `ID:${newId}`
      return `人员：${oldName} → ${newName}`
    }
    // 修改：其他字段
    const fieldText = log.field ? FIELD_MAP[log.field] || log.field : ''
    return `${fieldText}: ${log.oldValue ?? '-'} → ${log.newValue ?? '-'}`
  }

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="录入历史记录"
        desc="查看谁录入了数据、谁修改了数据，仅会长与超管可见"
      />

      {/* 筛选栏 */}
      <motion.div
        className="bg-card border border-border rounded-xl p-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-2 mb-3 text-textSecondary">
          <Filter size={16} />
          <span className="text-sm font-medium">筛选条件</span>
          {hasFilter && (
            <button
              onClick={handleReset}
              className="ml-auto flex items-center gap-1 text-xs text-textMuted hover:text-primary transition-colors duration-200 cursor-pointer"
            >
              <RefreshCw size={12} />
              重置
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 操作类型 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              操作类型
            </label>
            <select
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as DataLogType | '')
              }
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            >
              <option value="">全部</option>
              <option value="create">录入</option>
              <option value="update">修改</option>
              <option value="delete">删除</option>
            </select>
          </div>

          {/* 操作日期 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              操作日期
            </label>
            <div className="relative">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition-colors duration-200"
                  title="清除日期"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* 厅 */}
          {isHuizhang && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                厅
              </label>
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                <option value="">全部</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 人员（搜索框，选中后自动定位所在厅） */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              人员
            </label>
            <SearchableSelect
              value={filterPersonnelId}
              onChange={handlePersonnelChange}
              options={personnelOptions}
              placeholder="搜索人员..."
              emptyText="无匹配人员"
            />
          </div>
        </div>
      </motion.div>

      {/* 历史记录表格 */}
      <motion.div
        className="bg-card border border-border rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              历史记录
            </h3>
            {!loading && (
              <span className="text-xs text-textMuted">
                共 {logs.length} 条
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">操作人</th>
                <th className="px-3 py-2 font-medium">操作</th>
                <th className="px-3 py-2 font-medium">人员</th>
                <th className="px-3 py-2 font-medium">厅</th>
                <th className="px-3 py-2 font-medium">所属周</th>
                <th className="px-3 py-2 font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pagedLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-12 text-center text-textMuted"
                  >
                    {hasFilter ? '当前筛选条件下暂无记录' : '暂无历史记录'}
                  </td>
                </tr>
              ) : (
                pagedLogs.map((log) => {
                  const typeInfo = TYPE_MAP[log.type]
                  const TypeIcon = typeInfo.icon
                  const detail = renderDetail(log)
                  return (
                    <tr
                      key={`${log.type}-${log.id}`}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                    >
                      <td className="px-3 py-2 text-textSecondary whitespace-nowrap font-mono text-xs">
                        {formatDateTime(log.time)}
                      </td>
                      <td className="px-3 py-2 text-textPrimary font-medium">
                        {log.operatorName}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${typeInfo.cls}`}
                        >
                          <TypeIcon size={12} />
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-textPrimary">
                        {log.personnelName}
                      </td>
                      <td className="px-3 py-2 text-textSecondary">
                        {log.branchName}
                      </td>
                      <td className="px-3 py-2 text-textSecondary whitespace-nowrap text-xs">
                        {getWeekRangeText(log.weekStart)}
                      </td>
                      <td className="px-3 py-2 text-textSecondary text-xs">
                        {detail}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {/* 分页控件：每页 50 条 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span className="text-textSecondary">
              第 {safePage} / {totalPages} 页（共 {logs.length} 条）
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title="上一页"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-textPrimary font-mono">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title="下一页"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
