import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  dataHistoryApi,
  branchesApi,
  personnelApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import SubPageHeader from '../../components/SubPageHeader'
import type { Branch, Personnel, DataLogItem, DataLogType } from '../../types'

import { SECTION_CONFIG, FIELD_LABELS } from './data-history/config'
import {
  DETAIL_PAGE_SIZE,
  PERSONNEL_PAGE_SIZE,
  type ViewState,
  type PersonnelAgg,
  type FieldAgg,
  type BreadcrumbItem,
} from './data-history/types'
import { getLogFields, getTotalPages, getSafePage } from './data-history/helpers'

import FilterBar from './data-history/components/FilterBar'
import Breadcrumb from './data-history/components/Breadcrumb'
import TypeCardsView from './data-history/components/TypeCardsView'
import PersonnelCardsView from './data-history/components/PersonnelCardsView'
import FieldCardsView from './data-history/components/FieldCardsView'
import DetailTableView from './data-history/components/DetailTableView'
import PersonnelAllLogsView from './data-history/components/PersonnelAllLogsView'

/**
 * 录入历史记录页面
 * 四级交互：操作类型 → 人员 → 字段 → 详细记录
 * 仅会长与超管可见
 */
export default function DataHistoryPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canView = isHuizhang || isChaoguan

  // 数据状态
  const [logs, setLogs] = useState<DataLogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])

  // 四级视图状态
  const [view, setView] = useState<ViewState>({ level: 'type' })

  // 分页状态
  const [personnelPage, setPersonnelPage] = useState(1)
  const [detailPage, setDetailPage] = useState(1)

  // 筛选条件
  const [filterDate, setFilterDate] = useState('')
  const [filterBranchId, setFilterBranchId] = useState('')
  const [filterPersonnelId, setFilterPersonnelId] = useState('')

  const hasFilter = Boolean(filterDate || filterBranchId || filterPersonnelId)

  // ============ 数据加载 ============
  const loadLogs = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof dataHistoryApi.list>[0] = { limit: 500 }
      if (filterDate) params.date = filterDate
      if (filterBranchId) params.branchId = Number(filterBranchId)
      if (filterPersonnelId) params.personnelId = Number(filterPersonnelId)
      const list = await dataHistoryApi.list(params)
      setLogs(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // 初次加载：厅和人员列表
  useEffect(() => {
    if (!canView) return
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
    personnelApi.list().then(setPersonnel).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, isHuizhang])

  // 筛选条件变化时重新加载日志
  useEffect(() => {
    if (!canView) return
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterBranchId, filterPersonnelId])

  // ============ 人员选择联动厅 ============
  const handlePersonnelChange = (v: string) => {
    setFilterPersonnelId(v)
    // 选择人员时自动定位到该人员所属的第一个厅（仅会长可见厅选择器时生效）
    if (v && isHuizhang) {
      const p = personnel.find((x) => x.id === Number(v))
      const firstBranch = p?.branches?.[0]
      if (firstBranch && String(firstBranch.id) !== filterBranchId) {
        setFilterBranchId(String(firstBranch.id))
      }
    }
  }

  // 厅变化时清空人员（仅当人员不属于当前厅时）
  useEffect(() => {
    if (!filterPersonnelId || !filterBranchId) return
    const p = personnel.find((x) => x.id === Number(filterPersonnelId))
    const belongsToBranch = p?.branches?.some((b) => String(b.id) === filterBranchId)
    if (!belongsToBranch) {
      setFilterPersonnelId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBranchId])

  const handleReset = () => {
    setFilterDate('')
    setFilterBranchId('')
    setFilterPersonnelId('')
  }

  // ============ 派生数据 ============
  // 人员 ID → 名称映射
  const personnelMap = useMemo(() => {
    const m = new Map<number, string>()
    personnel.forEach((p) => m.set(p.id, p.name))
    return m
  }, [personnel])

  // 按操作类型分组
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

  // 当前选中的类型（personnel-all 视图无类型）
  const activeType: DataLogType | null =
    view.level === 'type' || view.level === 'personnel-all' ? null : view.type

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
  const personnelTotalPages = getTotalPages(personnelAggList.length, PERSONNEL_PAGE_SIZE)
  const safePersonnelPage = getSafePage(personnelPage, personnelTotalPages)

  // 当前人员在该类型下的所有日志
  const personLogs = useMemo(() => {
    if (view.level !== 'field' && view.level !== 'detail') return []
    return logsByType[view.type].filter((l) => l.personnelId === view.personnelId)
  }, [view, logsByType])

  // Level 3: 当前人员在该类型下按字段聚合
  const fieldAggList = useMemo<FieldAgg[]>(() => {
    const map = new Map<FieldAgg['field'], FieldAgg>()
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

  const detailTotalPages = getTotalPages(detailLogs.length, DETAIL_PAGE_SIZE)
  const safeDetailPage = getSafePage(detailPage, detailTotalPages)

  // personnel-all 视图：当前人员的所有历史记录（合并所有操作类型，按时间倒序）
  const personnelAllLogs = useMemo(() => {
    if (view.level !== 'personnel-all') return []
    return logs
      .filter((l) => l.personnelId === view.personnelId)
      .sort((a, b) => b.time.localeCompare(a.time))
  }, [view, logs])

  const personnelAllTotalPages = getTotalPages(personnelAllLogs.length, DETAIL_PAGE_SIZE)
  const safePersonnelAllPage = getSafePage(detailPage, personnelAllTotalPages)

  // ============ 视图切换重置 ============
  useEffect(() => {
    setPersonnelPage(1)
    setDetailPage(1)
  }, [view])

  // 筛选变化时重置视图：选中人员时直接进入该人员全部记录视图，否则回到类型卡片入口
  useEffect(() => {
    if (filterPersonnelId) {
      setView({ level: 'personnel-all', personnelId: Number(filterPersonnelId) })
    } else {
      setView({ level: 'type' })
    }
  }, [filterDate, filterBranchId, filterPersonnelId])

  // ============ 无权限提示 ============
  if (!canView) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  // 当前人员姓名（personnel-all 视图时从 logs 中查找，其他视图从人员聚合列表查找）
  const currentPersonnelName =
    view.level === 'personnel-all'
      ? (logs.find((l) => l.personnelId === view.personnelId)?.personnelName ?? `ID:${view.personnelId}`)
      : view.level === 'field' || view.level === 'detail'
        ? (personnelAggList.find((p) => p.personnelId === view.personnelId)?.personnelName ?? `ID:${view.personnelId}`)
        : ''

  // ============ 面包屑配置 ============
  // 点击「全部记录」：若当前是人员筛选视图，先清空人员筛选（会触发回到类型入口），否则直接回到类型入口
  const goBackToType = () => {
    if (filterPersonnelId) {
      setFilterPersonnelId('')
    } else {
      setView({ level: 'type' })
    }
  }
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: '全部记录', onClick: goBackToType },
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
    const person = personnelAggList.find((p) => p.personnelId === view.personnelId)
    breadcrumbItems.push({
      label: person?.personnelName ?? `ID:${view.personnelId}`,
      onClick:
        view.level === 'detail'
          ? () => setView({ level: 'field', type: view.type, personnelId: view.personnelId })
          : undefined,
    })
  }
  if (view.level === 'detail') {
    const meta = FIELD_LABELS.find((f) => f.key === view.field)
    breadcrumbItems.push({ label: meta?.label ?? view.field })
  }
  if (view.level === 'personnel-all') {
    breadcrumbItems.push({ label: currentPersonnelName })
  }

  // ============ 渲染 ============
  return (
    <div className="space-y-5">
      <SubPageHeader
        title="录入历史记录"
        desc="按录入/修改/删除分类，逐步深入查看操作记录，仅会长与超管可见"
      />

      {/* 筛选条件区 */}
      <FilterBar
        filterDate={filterDate}
        filterBranchId={filterBranchId}
        filterPersonnelId={filterPersonnelId}
        branches={branches}
        personnel={personnel}
        isHuizhang={isHuizhang}
        hasFilter={hasFilter}
        onDateChange={setFilterDate}
        onBranchChange={setFilterBranchId}
        onPersonnelChange={handlePersonnelChange}
        onReset={handleReset}
      />

      {/* 面包屑 + 汇总 */}
      <Breadcrumb items={breadcrumbItems} totalCount={logs.length} isFiltered={hasFilter} />

      {/* 四级视图切换 */}
      <AnimatePresence mode="wait">
        {view.level === 'type' && (
          <TypeCardsView
            logsByType={logsByType}
            loading={loading}
            onSelect={(type) => setView({ level: 'personnel', type })}
          />
        )}

        {view.level === 'personnel' && (
          <PersonnelCardsView
            type={view.type}
            personnelAggList={personnelAggList}
            loading={loading}
            currentPage={safePersonnelPage}
            totalPages={personnelTotalPages}
            onBack={() => setView({ level: 'type' })}
            onSelect={(personnelId) =>
              setView({ level: 'field', type: view.type, personnelId })
            }
            onPageChange={setPersonnelPage}
          />
        )}

        {view.level === 'field' && (
          <FieldCardsView
            type={view.type}
            personnelName={currentPersonnelName}
            fieldAggList={fieldAggList}
            loading={loading}
            onBack={() => setView({ level: 'personnel', type: view.type })}
            onSelect={(field) =>
              setView({ level: 'detail', type: view.type, personnelId: view.personnelId, field })
            }
          />
        )}

        {view.level === 'detail' && (
          <DetailTableView
            type={view.type}
            personnelName={currentPersonnelName}
            field={view.field}
            detailLogs={detailLogs}
            loading={loading}
            currentPage={safeDetailPage}
            totalPages={detailTotalPages}
            personnelMap={personnelMap}
            onBack={() =>
              setView({ level: 'field', type: view.type, personnelId: view.personnelId })
            }
            onPageChange={setDetailPage}
          />
        )}

        {view.level === 'personnel-all' && (
          <PersonnelAllLogsView
            personnelName={currentPersonnelName}
            logs={personnelAllLogs}
            loading={loading}
            currentPage={safePersonnelAllPage}
            totalPages={personnelAllTotalPages}
            personnelMap={personnelMap}
            onBack={goBackToType}
            onPageChange={setDetailPage}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
