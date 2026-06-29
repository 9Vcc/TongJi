import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History,
  Filter,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ArrowLeft,
} from 'lucide-react'
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
import type {
  Branch,
  Personnel,
  DataLogItem,
  DataLogType,
} from '../../types'

// 板块配置：标题、图标、配色、描述
const SECTION_CONFIG: Record<
  DataLogType,
  {
    label: string
    icon: typeof Plus
    iconCls: string
    badgeCls: string
    cardCls: string
    desc: string
  }
> = {
  create: {
    label: '录入',
    icon: Plus,
    iconCls: 'text-success',
    badgeCls: 'bg-success/10 text-success',
    cardCls: 'hover:border-success/40 hover:bg-success/5',
    desc: '查看所有录入操作记录',
  },
  update: {
    label: '修改',
    icon: Pencil,
    iconCls: 'text-warning',
    badgeCls: 'bg-warning/10 text-warning',
    cardCls: 'hover:border-warning/40 hover:bg-warning/5',
    desc: '查看所有修改操作记录',
  },
  delete: {
    label: '删除',
    icon: Trash2,
    iconCls: 'text-danger',
    badgeCls: 'bg-danger/10 text-danger',
    cardCls: 'hover:border-danger/40 hover:bg-danger/5',
    desc: '查看所有删除操作记录',
  },
}

// 字段中文名映射
const FIELD_MAP: Record<string, string> = {
  sg: '收光',
  mx: '麦序',
  qm: '全麦',
  personnelId: '人员',
}

// 详情视图属性
interface DetailProps {
  type: DataLogType
  logs: DataLogItem[]
  loading: boolean
  personnelMap: Map<number, string>
  onBack: () => void
}

// 详情视图分页大小
const DETAIL_PAGE_SIZE = 10

function DetailView({
  type,
  logs,
  loading,
  personnelMap,
  onBack,
}: DetailProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const config = SECTION_CONFIG[type]
  const Icon = config.icon

  // 数据变化时重置到第 1 页
  useEffect(() => {
    setCurrentPage(1)
  }, [logs.length])

  const totalPages = Math.max(1, Math.ceil(logs.length / DETAIL_PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedLogs = useMemo(
    () =>
      logs.slice((safePage - 1) * DETAIL_PAGE_SIZE, safePage * DETAIL_PAGE_SIZE),
    [logs, safePage],
  )

  // 渲染详情文本
  const renderDetail = (log: DataLogItem): string => {
    if (log.type === 'create') {
      return `收光 ${log.sg ?? 0} · 麦序 ${log.mx ?? 0} · 全麦 ${log.qm ?? 0}`
    }
    if (log.type === 'delete') {
      try {
        const parsed = JSON.parse(log.oldValue || '{}') as {
          sg?: number
          mx?: number
          qm?: number
        }
        return `删除前：收光 ${parsed.sg ?? 0} · 麦序 ${parsed.mx ?? 0} · 全麦 ${parsed.qm ?? 0}`
      } catch {
        return log.oldValue || '-'
      }
    }
    if (log.field === 'personnelId') {
      const oldId = Number(log.oldValue)
      const newId = Number(log.newValue)
      const oldName = personnelMap.get(oldId) || `ID:${oldId}`
      const newName = personnelMap.get(newId) || `ID:${newId}`
      return `人员：${oldName} → ${newName}`
    }
    const fieldText = log.field ? FIELD_MAP[log.field] || log.field : ''
    return `${fieldText}: ${log.oldValue ?? '-'} → ${log.newValue ?? '-'}`
  }

  return (
    <motion.div
      className="bg-card border border-border rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 详情标题栏：含返回按钮 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1 text-textSecondary hover:text-textPrimary hover:bg-surface rounded transition-colors duration-200 cursor-pointer"
            title="返回"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">返回</span>
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Icon size={18} className={config.iconCls} />
            <h3 className="text-base font-semibold text-textPrimary">
              {config.label}记录
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeCls}`}
            >
              {logs.length}
            </span>
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr className="text-left text-textSecondary">
              <th className="px-3 py-2 font-medium whitespace-nowrap">时间</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">操作人</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">人员</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">厅</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">所属周</th>
              <th className="px-3 py-2 font-medium">详情</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">备注</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
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
                  暂无{config.label}记录
                </td>
              </tr>
            ) : (
              pagedLogs.map((log) => (
                <tr
                  key={`${log.type}-${log.id}`}
                  className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                >
                  <td className="px-3 py-2 text-textSecondary whitespace-nowrap font-mono text-xs">
                    {formatDateTime(log.time)}
                  </td>
                  <td className="px-3 py-2 text-textPrimary font-medium whitespace-nowrap">
                    {log.operatorName}
                  </td>
                  <td className="px-3 py-2 text-textPrimary whitespace-nowrap">
                    {log.personnelName}
                  </td>
                  <td className="px-3 py-2 text-textSecondary whitespace-nowrap">
                    {log.branchName}
                  </td>
                  <td className="px-3 py-2 text-textSecondary whitespace-nowrap text-xs">
                    {getWeekRangeText(log.weekStart)}
                  </td>
                  <td className="px-3 py-2 text-textSecondary text-xs">
                    {renderDetail(log)}
                  </td>
                  <td className="px-3 py-2 text-textSecondary text-xs max-w-[200px]">
                    {log.remark ? (
                      <span
                        className="inline-flex items-start gap-1"
                        title={log.remark}
                      >
                        <MessageSquare
                          size={12}
                          className="text-textMuted mt-0.5 flex-shrink-0"
                        />
                        <span className="truncate">{log.remark}</span>
                      </span>
                    ) : (
                      <span className="text-textMuted">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm">
          <span className="text-textMuted text-xs">
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
            <span className="px-3 text-textPrimary font-mono text-xs">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
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
  )
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

  // 当前查看的板块：null=卡片入口视图，'create'/'update'/'delete'=详情视图
  const [activeSection, setActiveSection] = useState<DataLogType | null>(null)

  // 筛选条件
  const [filterDate, setFilterDate] = useState('')
  const [filterBranchId, setFilterBranchId] = useState('')
  const [filterPersonnelId, setFilterPersonnelId] = useState('')

  // 标记：人员选中时自动设置的 branchId，避免触发清空 personnelId
  const autoBranchRef = useRef(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof dataHistoryApi.list>[0] = {}
      if (filterDate) params.date = filterDate
      if (filterBranchId) params.branchId = Number(filterBranchId)
      if (filterPersonnelId) params.personnelId = Number(filterPersonnelId)
      params.limit = 500
      const list = await dataHistoryApi.list(params)
      setLogs(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载：厅列表、人员列表
  useEffect(() => {
    if (!canView) return
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
    personnelApi.list().then(setPersonnel).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, isHuizhang])

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (!canView) return
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterBranchId, filterPersonnelId])

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
        if (String(firstBranch.id) !== filterBranchId) {
          autoBranchRef.current = true
          setFilterBranchId(String(firstBranch.id))
        }
      }
    }
  }

  // 重置筛选
  const handleReset = () => {
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

  const hasFilter = filterDate || filterBranchId || filterPersonnelId

  // 人员 ID → 名称映射
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
    [personnel],
  )

  // 按类型分组
  const createLogs = useMemo(
    () => logs.filter((l) => l.type === 'create'),
    [logs],
  )
  const updateLogs = useMemo(
    () => logs.filter((l) => l.type === 'update'),
    [logs],
  )
  const deleteLogs = useMemo(
    () => logs.filter((l) => l.type === 'delete'),
    [logs],
  )

  // 当前板块的数据
  const activeLogs = useMemo(() => {
    if (activeSection === 'create') return createLogs
    if (activeSection === 'update') return updateLogs
    if (activeSection === 'delete') return deleteLogs
    return []
  }, [activeSection, createLogs, updateLogs, deleteLogs])

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="录入历史记录"
        desc="按录入/修改/删除分类查看操作记录，仅会长与超管可见"
      />

      {/* 筛选栏（始终显示） */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

          {/* 人员 */}
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

      {/* 汇总信息 */}
      <div className="flex items-center gap-2 text-xs text-textMuted">
        <History size={14} />
        <span>
          共 {logs.length} 条{hasFilter && '（已筛选）'}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {activeSection === null ? (
          /* 卡片入口视图：三个操作类型卡片 */
          <motion.div
            key="cards"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {(['create', 'update', 'delete'] as DataLogType[]).map((type) => {
              const config = SECTION_CONFIG[type]
              const Icon = config.icon
              const count =
                type === 'create'
                  ? createLogs.length
                  : type === 'update'
                  ? updateLogs.length
                  : deleteLogs.length
              return (
                <motion.button
                  key={type}
                  onClick={() => setActiveSection(type)}
                  className={`bg-card border border-border rounded-xl p-5 text-left transition-all duration-200 cursor-pointer ${config.cardCls}`}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`p-2.5 rounded-lg ${config.badgeCls}`}
                    >
                      <Icon size={22} />
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.badgeCls}`}
                    >
                      {count} 条
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-textPrimary mb-1">
                    {config.label}记录
                  </h3>
                  <p className="text-xs text-textMuted">{config.desc}</p>
                </motion.button>
              )
            })}
          </motion.div>
        ) : (
          /* 详情视图：展示选中板块的详细记录 */
          <DetailView
            key="detail"
            type={activeSection}
            logs={activeLogs}
            loading={loading}
            personnelMap={personnelMap}
            onBack={() => setActiveSection(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
