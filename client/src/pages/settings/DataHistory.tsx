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
  ArrowRight,
  ChevronRight as ChevronRightIcon,
  User,
  BarChart3,
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
import GroupedSelect from '../../components/GroupedSelect'
import SubPageHeader from '../../components/SubPageHeader'
import SearchableSelect from '../../components/SearchableSelect'
import DatePicker from '../../components/DatePicker'
import { formatDateTime, formatDate, getWeekRangeText, getMonthRangeText } from '../../utils'
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
type FieldKey = 'sg' | 'mx' | 'qm' | 'zcDays'
const FIELD_LABELS: { key: FieldKey; label: string; color: string }[] = [
  { key: 'sg', label: '收光', color: 'text-primary' },
  { key: 'mx', label: '麦序', color: 'text-warning' },
  { key: 'qm', label: '全麦', color: 'text-success' },
  { key: 'zcDays', label: '主持', color: 'text-info' },
]

// 各级分页大小
const DETAIL_PAGE_SIZE = 10
const PERSONNEL_PAGE_SIZE = 24

// 视图状态：四级交互
type ViewState =
  | { level: 'type' }
  | { level: 'personnel'; type: DataLogType }
  | { level: 'field'; type: DataLogType; personnelId: number }
  | {
      level: 'detail'
      type: DataLogType
      personnelId: number
      field: FieldKey
    }

/**
 * 判断 weekStart 是否为月初1日（月统计厅的数据归属日）
 */
function isMonthStart(weekStart: string): boolean {
  const d = new Date(weekStart)
  return d.getDate() === 1
}

/**
 * 格式化所属周期：月统计厅显示月份，周统计厅显示周次
 */
function formatPeriod(weekStart: string): string {
  if (isMonthStart(weekStart)) {
    return getMonthRangeText(weekStart)
  }
  return getWeekRangeText(weekStart)
}

/**
 * 从一条 log 中提取涉及的字段列表
 */
function getLogFields(log: DataLogItem): FieldKey[] {
  const result: FieldKey[] = []
  if (log.type === 'create') {
    for (const f of FIELD_LABELS) {
      if (log[f.key] !== undefined && log[f.key] !== 0) result.push(f.key)
    }
  } else if (log.type === 'delete') {
    let parsed: { sg?: number; mx?: number; qm?: number; zcDays?: number } = {}
    try {
      parsed = JSON.parse(log.oldValue || '{}')
    } catch {
      parsed = {}
    }
    for (const f of FIELD_LABELS) {
      if (parsed[f.key] !== undefined) result.push(f.key)
    }
  } else {
    // update
    const before = log.before
    const after = log.after
    if (before && after) {
      for (const f of FIELD_LABELS) {
        if (before[f.key] !== after[f.key]) result.push(f.key)
      }
    } else {
      // 兼容旧数据
      let oldParsed: { sg?: number; mx?: number; qm?: number; zcDays?: number } = {}
      let newParsed: { sg?: number; mx?: number; qm?: number; zcDays?: number } = {}
      try {
        oldParsed = JSON.parse(log.oldValue || '{}')
      } catch {
        oldParsed = {}
      }
      try {
        newParsed = JSON.parse(log.newValue || '{}')
      } catch {
        newParsed = {}
      }
      for (const f of FIELD_LABELS) {
        if (oldParsed[f.key] !== newParsed[f.key]) result.push(f.key)
      }
    }
  }
  return result
}

/**
 * 渲染数值变更单元格：create/update/delete 三种场景统一展示
 */
function renderChangeCell(log: DataLogItem, personnelMap: Map<number, string>, filterField?: FieldKey) {
  if (log.type === 'create') {
    const fields = FIELD_LABELS.filter(
      (f) => log[f.key] !== undefined && log[f.key] !== 0,
    )
    if (filterField) {
      const f = fields.find((x) => x.key === filterField)
      if (!f) return <span className="text-textMuted text-xs">-</span>
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-success/10 text-success font-mono">
          {f.label} {log[f.key]}
        </span>
      )
    }
    if (fields.length === 0) {
      return <span className="text-textMuted text-xs">无变更数据</span>
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span
            key={f.key}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-success/10 text-success font-mono"
          >
            {f.label} {log[f.key]}
          </span>
        ))}
      </div>
    )
  }

  if (log.type === 'delete') {
    let parsed: { sg?: number; mx?: number; qm?: number; zcDays?: number } = {}
    try {
      parsed = JSON.parse(log.oldValue || '{}')
    } catch {
      parsed = {}
    }
    const fields = FIELD_LABELS.filter((f) => parsed[f.key] !== undefined)
    if (filterField) {
      const f = fields.find((x) => x.key === filterField)
      if (!f) return <span className="text-textMuted text-xs">-</span>
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-danger/10 text-danger font-mono line-through">
          {f.label} {parsed[f.key]}
        </span>
      )
    }
    if (fields.length === 0) {
      return <span className="text-textMuted text-xs">-</span>
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span
            key={f.key}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-danger/10 text-danger font-mono line-through"
          >
            {f.label} {parsed[f.key]}
          </span>
        ))}
      </div>
    )
  }

  // 修改：显示 before → after 对比
  const before = log.before
  const after = log.after
  if (!before || !after) {
    let oldParsed: NonNullable<typeof before> = {}
    let newParsed: NonNullable<typeof after> = {}
    try {
      oldParsed = JSON.parse(log.oldValue || '{}')
    } catch {
      oldParsed = {}
    }
    try {
      newParsed = JSON.parse(log.newValue || '{}')
    } catch {
      newParsed = {}
    }
    return renderUpdateComparison(oldParsed, newParsed, personnelMap, filterField)
  }
  return renderUpdateComparison(before, after, personnelMap, filterField)
}

/**
 * 渲染修改对比：仅显示变更字段，before → after
 */
function renderUpdateComparison(
  before: { sg?: number; mx?: number; qm?: number; zcDays?: number; personnelId?: number } | null,
  after: { sg?: number; mx?: number; qm?: number; zcDays?: number; personnelId?: number } | null,
  personnelMap: Map<number, string>,
  filterField?: FieldKey,
) {
  if (!before || !after) {
    return <span className="text-textMuted text-xs">-</span>
  }
  const changes: { label: string; oldVal: string; newVal: string; key: string }[] = []
  for (const f of FIELD_LABELS) {
    const oldV = before[f.key]
    const newV = after[f.key]
    if (oldV !== newV) {
      changes.push({
        label: f.label,
        oldVal: String(oldV ?? 0),
        newVal: String(newV ?? 0),
        key: f.key,
      })
    }
  }
  if (before.personnelId !== undefined && after.personnelId !== undefined && before.personnelId !== after.personnelId) {
    const oldName = personnelMap.get(before.personnelId) || `ID:${before.personnelId}`
    const newName = personnelMap.get(after.personnelId) || `ID:${after.personnelId}`
    changes.push({
      label: '人员',
      oldVal: oldName,
      newVal: newName,
      key: 'personnel',
    })
  }
  let displayChanges = changes
  if (filterField) {
    displayChanges = changes.filter((c) => c.key === filterField)
  }
  if (displayChanges.length === 0) {
    return <span className="text-textMuted text-xs">无变更</span>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {displayChanges.map((c, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-warning/10 text-warning font-mono"
        >
          <span className="opacity-70">{c.label}</span>
          <span className="line-through opacity-60">{c.oldVal}</span>
          <ArrowRight size={10} className="opacity-70" />
          <span className="font-semibold">{c.newVal}</span>
        </span>
      ))}
    </div>
  )
}

// 人员聚合项：用于 Level 2 人员卡片展示
interface PersonnelAgg {
  personnelId: number
  personnelName: string
  branchName: string
  count: number
  lastTime: string
}

// 字段聚合项：用于 Level 3 字段卡片展示
interface FieldAgg {
  field: FieldKey
  label: string
  color: string
  count: number
  lastTime: string
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

  // 四级视图状态
  const [view, setView] = useState<ViewState>({ level: 'type' })

  // 分页
  const [personnelPage, setPersonnelPage] = useState(1)
  const [detailPage, setDetailPage] = useState(1)

  // 筛选条件
  const [filterDate, setFilterDate] = useState('')
  const [filterBranchId, setFilterBranchId] = useState('')
  const [filterPersonnelId, setFilterPersonnelId] = useState('')

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

  useEffect(() => {
    if (!canView) return
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
    personnelApi.list().then(setPersonnel).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, isHuizhang])

  useEffect(() => {
    if (!canView) return
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterBranchId, filterPersonnelId])

  useEffect(() => {
    if (autoBranchRef.current) {
      autoBranchRef.current = false
      return
    }
    setFilterPersonnelId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBranchId])

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

  const handleReset = () => {
    setFilterDate('')
    setFilterBranchId('')
    setFilterPersonnelId('')
  }

  const hasFilter = filterDate || filterBranchId || filterPersonnelId

  // 人员 ID → 名称映射
  const personnelMap = useMemo(() => {
    const m = new Map<number, string>()
    personnel.forEach((p) => m.set(p.id, p.name))
    return m
  }, [personnel])

  const personnelOptions = useMemo(
    () =>
      personnel.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [personnel],
  )

  // 按类型分组（Level 1 统计）
  const logsByType = useMemo(() => {
    const map: Record<DataLogType, DataLogItem[]> = {
      create: [],
      update: [],
      delete: [],
    }
    for (const log of logs) {
      map[log.type].push(log)
    }
    return map
  }, [logs])

  // 当前选中的类型
  const activeType: DataLogType | null =
    view.level === 'type' ? null : view.type

  // Level 2: 当前类型下按人员聚合
  const personnelAggList = useMemo<PersonnelAgg[]>(() => {
    if (!activeType) return []
    const typeLogs = logsByType[activeType]
    const map = new Map<number, PersonnelAgg>()
    for (const log of typeLogs) {
      const existing = map.get(log.personnelId)
      if (existing) {
        existing.count += 1
        if (log.time > existing.lastTime) existing.lastTime = log.time
      } else {
        map.set(log.personnelId, {
          personnelId: log.personnelId,
          personnelName: log.personnelName,
          branchName: log.branchName,
          count: 1,
          lastTime: log.time,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.lastTime.localeCompare(a.lastTime)
    })
  }, [activeType, logsByType])

  // Level 2 分页
  const personnelTotalPages = Math.max(
    1,
    Math.ceil(personnelAggList.length / PERSONNEL_PAGE_SIZE),
  )
  const safePersonnelPage = Math.min(personnelPage, personnelTotalPages)
  const pagedPersonnelAgg = useMemo(
    () =>
      personnelAggList.slice(
        (safePersonnelPage - 1) * PERSONNEL_PAGE_SIZE,
        safePersonnelPage * PERSONNEL_PAGE_SIZE,
      ),
    [personnelAggList, safePersonnelPage],
  )

  // 当前人员在该类型下的所有日志
  const personLogs = useMemo(() => {
    if (view.level !== 'field' && view.level !== 'detail') return []
    return logsByType[view.type].filter(
      (l) => l.personnelId === view.personnelId,
    )
  }, [view, logsByType])

  // Level 3: 当前人员在该类型下按字段聚合
  const fieldAggList = useMemo<FieldAgg[]>(() => {
    const map = new Map<FieldKey, FieldAgg>()
    for (const log of personLogs) {
      const fields = getLogFields(log)
      for (const fkey of fields) {
        const meta = FIELD_LABELS.find((f) => f.key === fkey)!
        const existing = map.get(fkey)
        if (existing) {
          existing.count += 1
          if (log.time > existing.lastTime) existing.lastTime = log.time
        } else {
          map.set(fkey, {
            field: fkey,
            label: meta.label,
            color: meta.color,
            count: 1,
            lastTime: log.time,
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return b.lastTime.localeCompare(a.lastTime)
    })
  }, [personLogs])

  // Level 4: 当前字段过滤后的详细记录
  const detailLogs = useMemo(() => {
    if (view.level !== 'detail') return []
    return personLogs.filter((l) => getLogFields(l).includes(view.field))
  }, [view, personLogs])

  const detailTotalPages = Math.max(1, Math.ceil(detailLogs.length / DETAIL_PAGE_SIZE))
  const safeDetailPage = Math.min(detailPage, detailTotalPages)
  const pagedDetailLogs = useMemo(
    () =>
      detailLogs.slice(
        (safeDetailPage - 1) * DETAIL_PAGE_SIZE,
        safeDetailPage * DETAIL_PAGE_SIZE,
      ),
    [detailLogs, safeDetailPage],
  )

  // 视图切换时重置分页
  useEffect(() => {
    setPersonnelPage(1)
    setDetailPage(1)
  }, [view])

  // 筛选变化时回到 Level 1
  useEffect(() => {
    setView({ level: 'type' })
  }, [filterDate, filterBranchId, filterPersonnelId])

  if (!canView) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  // 面包屑配置
  const breadcrumbItems: { label: string; onClick?: () => void }[] = [
    { label: '全部记录', onClick: () => setView({ level: 'type' }) },
  ]
  if (activeType) {
    breadcrumbItems.push({
      label: SECTION_CONFIG[activeType].label,
      onClick:
        view.level === 'field' || view.level === 'detail'
          ? () => setView({ level: 'personnel', type: activeType })
          : undefined,
    })
  }
  if (view.level === 'field' || view.level === 'detail') {
    const person = personnelAggList.find(
      (p) => p.personnelId === view.personnelId,
    )
    breadcrumbItems.push({
      label: person?.personnelName ?? `ID:${view.personnelId}`,
      onClick:
        view.level === 'detail'
          ? () =>
              setView({
                level: 'field',
                type: view.type,
                personnelId: view.personnelId,
              })
          : undefined,
    })
  }
  if (view.level === 'detail') {
    const meta = FIELD_LABELS.find((f) => f.key === view.field)
    breadcrumbItems.push({ label: meta?.label ?? view.field })
  }

  // 当前人员姓名
  const currentPersonnelName =
    view.level === 'field' || view.level === 'detail'
      ? (personnelAggList.find((p) => p.personnelId === view.personnelId)
          ?.personnelName ?? `ID:${view.personnelId}`)
      : ''

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="录入历史记录"
        desc="按录入/修改/删除分类，逐步深入查看操作记录，仅会长与超管可见"
      />

      {/* 筛选栏（始终显示） */}
      <motion.div
        className="art-card p-4"
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
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              操作日期
            </label>
            <DatePicker
              value={filterDate}
              onChange={(val) => setFilterDate(val)}
              fullWidth
              allowClear
              showYear
              maxDate={formatDate(new Date())}
              placeholder="选择日期"
            />
          </div>
          {isHuizhang && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                厅
              </label>
              <GroupedSelect
                value={filterBranchId}
                onChange={(val) => setFilterBranchId(val)}
                fullWidth
                topOption={{ value: '', label: '全部' }}
                options={branches.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
              />
            </div>
          )}
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

      {/* 面包屑 + 汇总 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm">
          {breadcrumbItems.map((item, idx) => {
            const isLast = idx === breadcrumbItems.length - 1
            return (
              <div key={idx} className="flex items-center gap-1">
                {idx > 0 && (
                  <ChevronRightIcon
                    size={14}
                    className="text-textMuted mx-0.5"
                  />
                )}
                {isLast || !item.onClick ? (
                  <span className="text-textPrimary font-medium">
                    {item.label}
                  </span>
                ) : (
                  <button
                    onClick={item.onClick}
                    className="text-textSecondary hover:text-primary transition-colors duration-200 cursor-pointer"
                  >
                    {item.label}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-textMuted">
          <History size={14} />
          <span>
            共 {logs.length} 条{hasFilter && '（已筛选）'}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Level 1: 类型卡片 */}
        {view.level === 'type' && (
          <motion.div
            key="type-cards"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {(['create', 'update', 'delete'] as DataLogType[]).map((type) => {
              const config = SECTION_CONFIG[type]
              const Icon = config.icon
              const count = logsByType[type].length
              const personCount = new Set(
                logsByType[type].map((l) => l.personnelId),
              ).size
              return (
                <motion.button
                  key={type}
                  onClick={() => setView({ level: 'personnel', type })}
                  disabled={loading}
                  className={`art-card p-5 text-left transition-all duration-200 cursor-pointer ${config.cardCls} disabled:opacity-60`}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-custom-sm ${config.badgeCls}`}>
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
                  {count > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs text-textSecondary">
                      <User size={12} />
                      <span>涉及 {personCount} 人</span>
                    </div>
                  )}
                </motion.button>
              )
            })}
          </motion.div>
        )}

        {/* Level 2: 人员卡片列表 */}
        {view.level === 'personnel' && (
          <motion.div
            key={`personnel-${view.type}`}
            className="space-y-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView({ level: 'type' })}
                className="flex items-center gap-1 px-2 py-1 text-textSecondary hover:text-textPrimary hover:bg-surface rounded transition-colors duration-200 cursor-pointer text-sm"
              >
                <ArrowLeft size={16} />
                <span>返回类型</span>
              </button>
              <div className="h-4 w-px bg-border" />
              {(() => {
                const config = SECTION_CONFIG[view.type]
                const Icon = config.icon
                return (
                  <div className="flex items-center gap-2">
                    <Icon size={18} className={config.iconCls} />
                    <span className="text-sm font-medium text-textPrimary">
                      {config.label}记录 - 人员列表
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeCls}`}
                    >
                      {personnelAggList.length} 人
                    </span>
                  </div>
                )
              })()}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="art-card p-3">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : pagedPersonnelAgg.length === 0 ? (
              <div className="art-card px-5 py-16 text-center text-sm text-textMuted">
                暂无{SECTION_CONFIG[view.type].label}记录
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {pagedPersonnelAgg.map((p) => {
                    const config = SECTION_CONFIG[view.type]
                    return (
                      <motion.button
                        key={p.personnelId}
                        onClick={() =>
                          setView({
                            level: 'field',
                            type: view.type,
                            personnelId: p.personnelId,
                          })
                        }
                        className={`art-card p-3 text-left transition-all duration-200 cursor-pointer ${config.cardCls}`}
                        whileHover={{ y: -2 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className={`p-1.5 rounded-full ${config.badgeCls}`}>
                            <User size={14} />
                          </div>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${config.badgeCls}`}
                          >
                            {p.count}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-textPrimary truncate">
                          {p.personnelName}
                        </div>
                        <div className="text-[10px] text-textMuted mt-0.5 truncate">
                          {p.branchName}
                        </div>
                        <div className="text-[10px] text-textMuted mt-1 font-mono">
                          {formatDateTime(p.lastTime)}
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
                {personnelTotalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-textMuted">
                      共 {personnelAggList.length} 人，第 {safePersonnelPage}/{personnelTotalPages} 页
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setPersonnelPage((p) => Math.max(1, p - 1))
                        }
                        disabled={safePersonnelPage <= 1}
                        className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="px-3 text-textPrimary font-mono text-xs">
                        {safePersonnelPage} / {personnelTotalPages}
                      </span>
                      <button
                        onClick={() =>
                          setPersonnelPage((p) =>
                            Math.min(personnelTotalPages, p + 1),
                          )
                        }
                        disabled={safePersonnelPage >= personnelTotalPages}
                        className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Level 3: 字段卡片列表（收光/麦序/全麦/主持） */}
        {view.level === 'field' && (
          <motion.div
            key={`field-${view.type}-${view.personnelId}`}
            className="space-y-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView({ level: 'personnel', type: view.type })}
                className="flex items-center gap-1 px-2 py-1 text-textSecondary hover:text-textPrimary hover:bg-surface rounded transition-colors duration-200 cursor-pointer text-sm"
              >
                <ArrowLeft size={16} />
                <span>返回人员列表</span>
              </button>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <User size={18} className="text-textSecondary" />
                <span className="text-sm font-medium text-textPrimary">
                  {currentPersonnelName}
                </span>
                <span className="text-xs text-textMuted">
                  {SECTION_CONFIG[view.type].label} - 数据字段
                </span>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="art-card p-3">
                    <Skeleton className="h-20 w-full" />
                  </div>
                ))}
              </div>
            ) : fieldAggList.length === 0 ? (
              <div className="art-card px-5 py-16 text-center text-sm text-textMuted">
                暂无字段数据
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {fieldAggList.map((f) => (
                  <motion.button
                    key={f.field}
                    onClick={() =>
                      setView({
                        level: 'detail',
                        type: view.type,
                        personnelId: view.personnelId,
                        field: f.field,
                      })
                    }
                    className="art-card p-4 text-left transition-all duration-200 cursor-pointer hover:border-primary/40 hover:bg-primary/5"
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 rounded-custom-sm bg-primary/10">
                        <BarChart3 size={18} className={f.color} />
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                        {f.count}
                      </span>
                    </div>
                    <div className="text-base font-semibold text-textPrimary">
                      {f.label}
                    </div>
                    <div className="text-[10px] text-textMuted mt-1 font-mono">
                      {formatDateTime(f.lastTime)}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Level 4: 字段详细操作记录 */}
        {view.level === 'detail' && (
          <motion.div
            key={`detail-${view.type}-${view.personnelId}-${view.field}`}
            className="art-card overflow-hidden"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {(() => {
              const config = SECTION_CONFIG[view.type]
              const Icon = config.icon
              const fieldMeta = FIELD_LABELS.find((f) => f.key === view.field)
              return (
                <>
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface/50">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setView({
                            level: 'field',
                            type: view.type,
                            personnelId: view.personnelId,
                          })
                        }
                        className="flex items-center gap-1 px-2 py-1 text-textSecondary hover:text-textPrimary hover:bg-surface rounded transition-colors duration-200 cursor-pointer"
                        title="返回字段列表"
                      >
                        <ArrowLeft size={18} />
                        <span className="text-sm">返回</span>
                      </button>
                      <div className="h-4 w-px bg-border" />
                      <div className="flex items-center gap-2">
                        <Icon size={18} className={config.iconCls} />
                        <h3 className="text-base font-semibold text-textPrimary">
                          {currentPersonnelName}
                        </h3>
                        <span className="text-xs text-textMuted">
                          {config.label} · {fieldMeta?.label}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeCls}`}
                        >
                          {detailLogs.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface border-b border-border">
                        <tr className="text-left text-textSecondary">
                          <th className="px-3 py-2 font-medium whitespace-nowrap">
                            时间
                          </th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">
                            操作人
                          </th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">
                            厅
                          </th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">
                            周期
                          </th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">
                            时段
                          </th>
                          <th className="px-3 py-2 font-medium">变更内容</th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">
                            备注
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          Array.from({ length: 8 }).map((_, i) => (
                            <tr
                              key={i}
                              className="border-b border-border last:border-0"
                            >
                              {Array.from({ length: 7 }).map((_, j) => (
                                <td key={j} className="px-3 py-2">
                                  <Skeleton className="h-5 w-full" />
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : pagedDetailLogs.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-3 py-12 text-center text-textMuted"
                            >
                              暂无{fieldMeta?.label}记录
                            </td>
                          </tr>
                        ) : (
                          pagedDetailLogs.map((log) => (
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
                              <td className="px-3 py-2 text-textSecondary whitespace-nowrap">
                                {log.branchName}
                              </td>
                              <td className="px-3 py-2 text-textSecondary whitespace-nowrap text-xs">
                                {formatPeriod(log.weekStart)}
                              </td>
                              <td className="px-3 py-2 text-textSecondary whitespace-nowrap text-xs">
                                {log.slotDate && log.slotIndex !== undefined ? (
                                  <span className="inline-flex flex-col gap-0.5">
                                    <span className="font-mono">{log.slotDate}</span>
                                    <span className="text-textMuted">
                                      {log.slotIndex * 2}-{log.slotIndex * 2 + 2} 时段
                                      {log.multiplier !== undefined && log.multiplier !== 1 && (
                                        <span className="text-primary ml-1">×{log.multiplier}</span>
                                      )}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-textMuted">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {renderChangeCell(log, personnelMap, view.field)}
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
                                    <span className="truncate">
                                      {log.remark}
                                    </span>
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

                  {detailTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm">
                      <span className="text-textMuted text-xs">
                        第 {safeDetailPage} / {detailTotalPages} 页（共{' '}
                        {detailLogs.length} 条）
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setDetailPage((p) => Math.max(1, p - 1))
                          }
                          disabled={safeDetailPage <= 1}
                          className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                          title="上一页"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 text-textPrimary font-mono text-xs">
                          {safeDetailPage} / {detailTotalPages}
                        </span>
                        <button
                          onClick={() =>
                            setDetailPage((p) =>
                              Math.min(detailTotalPages, p + 1),
                            )
                          }
                          disabled={safeDetailPage >= detailTotalPages}
                          className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                          title="下一页"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
