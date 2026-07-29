import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  RefreshCw,
  Search,
  X,
  Trash2,
  Info,
  Pencil,
  CheckSquare,
} from 'lucide-react'
import {
  hostFlowApi,
  personnelApi,
  branchesApi,
  rewardRulesApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { matchNamePinyin, formatMonthCN } from '../utils'
import { Skeleton, Spinner } from '../components/Skeleton'
import GroupedSelect from '../components/GroupedSelect'
import Modal from '../components/Modal'
import type { HostFlowRecord, Personnel, RewardRule } from '../types'

const PAGE_SIZE = 30

// 生成当前月的 YYYY-MM-DD（月初1日）
function currentMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// 将任意日期字符串归一到月初1日
function normalizeMonthStart(monthStr: string): string {
  if (!monthStr) return currentMonthStart()
  const d = new Date(monthStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return currentMonthStart()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// 校验流水金额（用户输入值）：非负数，最多两位小数
function isValidFlowValue(v: string): boolean {
  if (v === '') return false
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return false
  // 最多两位小数
  const rounded = Math.round(n * 100) / 100
  return rounded === n
}

// 10 的 n 次方（用于末尾补 0 换算）
function pow10(n: number): number {
  let r = 1
  for (let i = 0; i < n; i++) r *= 10
  return r
}

// 格式化数字（千分位）
function formatThousands(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const parts = n.toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts[1] === '00' ? parts[0] : parts.join('.')
}

// 编辑模态框的每行草稿
interface EditDraft {
  totalFlow: string
}

export default function HostFlowRecords() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canEdit = isHuizhang || isChaoguan

  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [records, setRecords] = useState<HostFlowRecord[]>([])
  const [rewardRule, setRewardRule] = useState<RewardRule | null>(null)

  // 月份选择：默认当前月
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStart())
  const [availableMonths, setAvailableMonths] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 行多选
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // 编辑模态框
  const [editOpen, setEditOpen] = useState(false)
  const [editTargets, setEditTargets] = useState<Personnel[]>([])
  const [editDrafts, setEditDrafts] = useState<Record<number, EditDraft>>({})
  const [editSaving, setEditSaving] = useState(false)

  // 厅选择：会长可任意选；超管默认主厅，可切换授权厅；管理默认本厅
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    if (isChaoguan) return branchId ?? user?.branchId ?? undefined
    return user?.branchId ?? undefined
  }, [isHuizhang, isChaoguan, branchId, user])

  // 加载厅列表
  useEffect(() => {
    branchesApi
      .list()
      .then((list) => setBranches(list.map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => {})
  }, [])

  // 加载人员（仅主持）
  const loadPersonnel = async () => {
    if (effectiveBranchId === undefined) {
      setPersonnel([])
      return
    }
    try {
      const list = await personnelApi.list(effectiveBranchId)
      // 仅保留标记为主持的人员
      setPersonnel(
        list.filter((p) =>
          p.branches?.some((b) => b.id === effectiveBranchId && b.isHost),
        ),
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
      setPersonnel([])
    }
  }

  // 加载流水记录
  const loadRecords = async () => {
    if (effectiveBranchId === undefined) {
      setRecords([])
      return
    }
    try {
      const list = await hostFlowApi.list({
        month: selectedMonth,
        branchId: effectiveBranchId,
      })
      setRecords(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setRecords([])
    }
  }

  // 加载奖励规则（取 flowMultiplier 和 flowZeroCount）
  const loadRewardRule = async () => {
    if (effectiveBranchId === undefined) {
      setRewardRule(null)
      return
    }
    try {
      const rules = await rewardRulesApi.get(effectiveBranchId)
      setRewardRule(rules[0] ?? null)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setRewardRule(null)
    }
  }

  // 加载有流水记录的月份列表（归一化为 YYYY-MM-01 格式，避免时区不匹配）
  const loadMonths = async () => {
    if (effectiveBranchId === undefined) {
      setAvailableMonths([currentMonthStart()])
      return
    }
    try {
      const months = await hostFlowApi.listMonths(effectiveBranchId)
      // 将后端返回的 ISO 字符串归一化为 YYYY-MM-01
      const normalized = months.map((m) => normalizeMonthStart(m))
      // 去重 + 降序排列
      const unique = Array.from(new Set(normalized)).sort((a, b) =>
        b.localeCompare(a),
      )
      // 确保当前月在列表中
      const cur = currentMonthStart()
      if (!unique.includes(cur)) unique.unshift(cur)
      setAvailableMonths(unique)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setAvailableMonths([currentMonthStart()])
    }
  }

  // 重新加载所有数据
  const reloadAll = async () => {
    setLoading(true)
    await Promise.all([loadPersonnel(), loadRecords(), loadRewardRule(), loadMonths()])
    setLoading(false)
  }

  // 切换厅或月份时重新加载
  useEffect(() => {
    if (effectiveBranchId !== undefined) {
      reloadAll()
      setSelectedIds(new Set())
    } else {
      setPersonnel([])
      setRecords([])
      setRewardRule(null)
      setAvailableMonths([currentMonthStart()])
      setSelectedIds(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, selectedMonth])

  // 搜索或切厅/月时重置到第1页
  useEffect(() => {
    setPage(1)
  }, [searchTerm, effectiveBranchId, selectedMonth])

  // 记录映射：(personnelId) -> record
  const recordMap = useMemo(() => {
    const m = new Map<number, HostFlowRecord>()
    for (const r of records) {
      m.set(r.personnelId, r)
    }
    return m
  }, [records])

  // 厅倍率
  const flowMultiplier = rewardRule?.flowMultiplier ?? 0
  // 末尾自动补 0 数量（默认 2）
  const flowZeroCount = rewardRule?.flowZeroCount ?? 2
  // 10^flowZeroCount（用于换算）
  const flowMultiplier10 = useMemo(() => pow10(flowZeroCount), [flowZeroCount])

  // 主持人员列表（支持搜索过滤）
  const filteredPersonnel = useMemo(() => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return personnel
    return personnel.filter((p) => matchNamePinyin(p.name, trimmed))
  }, [personnel, searchTerm])

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredPersonnel.length / PAGE_SIZE))
  const pagedPersonnel = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredPersonnel.slice(start, start + PAGE_SIZE)
  }, [filteredPersonnel, page])

  // 当前页数据合并：personnel + 已保存的 record
  type RowItem = {
    personnelId: number
    personnelName: string
    record: HostFlowRecord | undefined
    displayFlow: number // 只读显示用原始数值（反向换算）
    flowWelfare: number
  }

  const rows: RowItem[] = useMemo(() => {
    return pagedPersonnel.map((p) => {
      const record = recordMap.get(p.id)
      const actual = record ? Number(record.totalFlow) : 0
      const displayFlow = actual / flowMultiplier10
      const flowWelfare = Math.round(actual * flowMultiplier) / 100
      return {
        personnelId: p.id,
        personnelName: p.name,
        record,
        displayFlow,
        flowWelfare,
      }
    })
  }, [pagedPersonnel, recordMap, flowMultiplier, flowMultiplier10])

  // 当前页人员 ID（用于全选当前页）
  const currentPageIds = useMemo(
    () => pagedPersonnel.map((p) => p.id),
    [pagedPersonnel],
  )
  const allCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedIds.has(id))

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allCurrentPageSelected) {
        for (const id of currentPageIds) next.delete(id)
      } else {
        for (const id of currentPageIds) next.add(id)
      }
      return next
    })
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCount = selectedIds.size

  // KPI 汇总（仅基于已保存记录）
  // 总流水显示原始数值（反向换算），流水福利按实际金额计算
  const summary = useMemo(() => {
    let totalFlow = 0
    let totalWelfare = 0
    const hostCount = personnel.length
    const recordedCount = records.length
    for (const r of records) {
      const actual = Number(r.totalFlow) || 0
      totalFlow += actual / flowMultiplier10
      totalWelfare += actual * flowMultiplier / 100
    }
    return {
      hostCount,
      recordedCount,
      totalFlow: Math.round(totalFlow * 100) / 100,
      totalWelfare: Math.round(totalWelfare * 100) / 100,
    }
  }, [records, personnel, flowMultiplier, flowMultiplier10])

  // ============ 编辑模态框（单人/批量）============
  const openEditSingle = (p: Personnel) => {
    if (!effectiveBranchId) {
      toast.error('请先选择厅')
      return
    }
    setEditTargets([p])
    const record = recordMap.get(p.id)
    setEditDrafts({
      [p.id]: {
        totalFlow: record
          ? String(Number(record.totalFlow) / flowMultiplier10)
          : '',
      },
    })
    setEditOpen(true)
  }

  const openEditBatch = () => {
    if (!effectiveBranchId) {
      toast.error('请先选择厅')
      return
    }
    if (selectedIds.size === 0) {
      toast.error('请先勾选要编辑的人员')
      return
    }
    const targets = personnel.filter((p) => selectedIds.has(p.id))
    setEditTargets(targets)
    // 批量初始化：每人一个独立草稿，沿用当前已保存值
    const drafts: Record<number, EditDraft> = {}
    for (const p of targets) {
      const record = recordMap.get(p.id)
      drafts[p.id] = {
        totalFlow: record
          ? String(Number(record.totalFlow) / flowMultiplier10)
          : '',
      }
    }
    setEditDrafts(drafts)
    setEditOpen(true)
  }

  const updateEditDraft = (personnelId: number, patch: Partial<EditDraft>) => {
    setEditDrafts((prev) => ({
      ...prev,
      [personnelId]: { ...prev[personnelId], ...patch },
    }))
  }

  const removeEditTarget = (personnelId: number) => {
    setEditTargets((prev) => prev.filter((p) => p.id !== personnelId))
    setEditDrafts((prev) => {
      const next = { ...prev }
      delete next[personnelId]
      return next
    })
  }

  const handleEditSave = async () => {
    if (!effectiveBranchId) return
    const isBatch = editTargets.length > 1

    // 校验所有人员的流水金额
    for (const target of editTargets) {
      const draft = editDrafts[target.id]
      if (!draft) continue
      if (!isValidFlowValue(draft.totalFlow)) {
        toast.error(`「${target.name}」的流水金额必须为非负数（最多两位小数）`)
        return
      }
    }

    setEditSaving(true)
    try {
      // 串行提交，避免并发冲突
      for (const target of editTargets) {
        const draft = editDrafts[target.id]
        if (!draft) continue
        const actualFlow = Number(draft.totalFlow) * flowMultiplier10
        await hostFlowApi.upsert({
          branchId: effectiveBranchId,
          personnelId: target.id,
          month: selectedMonth,
          totalFlow: actualFlow,
        })
      }
      toast.success(isBatch ? `已批量保存 ${editTargets.length} 人流水` : '流水已保存')
      setEditOpen(false)
      if (isBatch) setSelectedIds(new Set())
      await Promise.all([loadRecords(), loadMonths()])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setEditSaving(false)
    }
  }

  // ============ 删除单条记录 ============
  const handleDelete = async (row: RowItem) => {
    if (!effectiveBranchId) return
    if (!row.record) {
      toast.error('该人员本月无流水记录')
      return
    }
    if (!window.confirm(`确认删除「${row.personnelName}」本月流水记录？`)) return
    setDeletingId(row.personnelId)
    try {
      await hostFlowApi.remove({
        branchId: effectiveBranchId,
        personnelId: row.personnelId,
        month: selectedMonth,
      })
      toast.success(`「${row.personnelName}」流水已删除`)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(row.personnelId)
        return next
      })
      await Promise.all([loadRecords(), loadMonths()])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  const hasBranchSelected = effectiveBranchId !== undefined
  const branchName = branches.find((b) => b.id === effectiveBranchId)?.name ?? '全部授权厅'
  const isBatchEdit = editTargets.length > 1

  return (
    <div className="space-y-5">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Banknote size={18} className="text-textSecondary" />
          <h3 className="text-base font-semibold text-textPrimary">主持流水记录</h3>
          <span className="text-xs text-textMuted hidden sm:inline">
            按月录入主持总流水，导出时自动计入流水福利
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <GroupedSelect
                value={
                  branchId !== undefined
                    ? String(branchId)
                    : isChaoguan
                      ? String(user?.branchId ?? '')
                      : ''
                }
                onChange={(val) =>
                  setBranchId(val ? Number(val) : undefined)
                }
                placeholder="选择厅"
                topOption={
                  isHuizhang ? { value: '', label: '选择厅' } : undefined
                }
                options={branches.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
                minWidth={150}
              />
              <GroupedSelect
                value={selectedMonth}
                onChange={(val) => setSelectedMonth(normalizeMonthStart(val))}
                minWidth={150}
                options={availableMonths.map((m) => ({
                  value: m,
                  label: formatMonthCN(m.slice(0, 7)),
                }))}
              />
              <button
                onClick={reloadAll}
                disabled={loading || !hasBranchSelected}
                className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textPrimary rounded-custom-sm text-sm font-medium hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title="刷新"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
          {!canEdit && (
            <GroupedSelect
              value={selectedMonth}
              onChange={(val) => setSelectedMonth(normalizeMonthStart(val))}
              minWidth={150}
              options={availableMonths.map((m) => ({
                value: m,
                label: formatMonthCN(m.slice(0, 7)),
              }))}
            />
          )}
        </div>
      </div>

      {/* 未选厅时提示（会长） */}
      {!hasBranchSelected ? (
        <div className="art-card px-5 py-16 text-center text-sm text-textMuted">
          请先选择厅
        </div>
      ) : (
        <>
          {/* KPI 汇总卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">主持人数</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary.hostCount}
              </div>
            </div>
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">已录入</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary.recordedCount}
              </div>
            </div>
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">总流水</div>
              <div className="text-2xl font-bold text-textPrimary font-mono">
                {summary.totalFlow}
              </div>
            </div>
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">流水福利合计</div>
              <div className="text-2xl font-bold text-primary font-mono">
                {summary.totalWelfare}
              </div>
            </div>
          </div>

          {/* 倍率提示 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-custom-sm bg-primary/5 border border-primary/20 text-xs text-textSecondary">
            <Info size={14} className="text-primary shrink-0" />
            <span>
              当前厅「{branchName}」流水倍率：
              <span className="font-mono text-primary font-semibold">
                {flowMultiplier}%
              </span>
              ，流水福利 = 总流水 × {flowMultiplier}% / 100
              {flowZeroCount > 0 && (
                <>
                  ；输入时自动补
                  <span className="font-mono text-primary font-semibold">
                    {' '}{flowZeroCount}{' '}
                  </span>
                  个 0（如输入 100 实际为 {formatThousands(100 * flowMultiplier10)}）
                </>
              )}
            </span>
          </div>

          {/* 搜索框 + 批量编辑按钮 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索主持姓名（支持中文首字母）"
                aria-label="搜索主持"
                className="w-full pl-10 pr-10 py-2.5 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors duration-200"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  aria-label="清除搜索"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary rounded transition-colors duration-200 cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {canEdit && selectedCount > 0 && (
              <button
                onClick={openEditBatch}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
              >
                <CheckSquare size={16} />
                批量编辑（{selectedCount} 人）
              </button>
            )}
          </div>

          {/* 流水表格 */}
          <div className="art-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    {canEdit && (
                      <th className="px-4 py-3 font-medium w-10">
                        <input
                          type="checkbox"
                          className="checkbox-round"
                          checked={allCurrentPageSelected}
                          onChange={toggleSelectAll}
                          aria-label="全选当前页"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 font-medium">序号</th>
                    <th className="px-4 py-3 font-medium">姓名</th>
                    <th className="px-4 py-3 font-medium">总流水</th>
                    <th className="px-4 py-3 font-medium">流水福利</th>
                    {canEdit && (
                      <th className="px-4 py-3 font-medium text-right">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0"
                      >
                        {Array.from({ length: canEdit ? 6 : 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedPersonnel.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 6 : 5}
                        className="px-4 py-16 text-center text-textMuted"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Banknote size={32} className="opacity-40" />
                          <span className="text-sm">
                            {searchTerm
                              ? '未找到匹配的主持'
                              : personnel.length === 0
                                ? '当前厅暂无主持，请先在人员管理页标记主持'
                                : '暂无数据'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const isSelected = selectedIds.has(row.personnelId)
                      return (
                      <tr
                        key={row.personnelId}
                        className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                          isSelected ? 'bg-primary/5' : ''
                        }`}
                      >
                        {canEdit && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="checkbox-round"
                              checked={isSelected}
                              onChange={() => toggleSelect(row.personnelId)}
                              aria-label={`选择 ${row.personnelName}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-textMuted font-mono">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-medium">
                          {row.personnelName}
                        </td>
                        <td className="px-4 py-3 font-mono text-textPrimary">
                          {row.displayFlow}
                        </td>
                        <td className="px-4 py-3 font-mono text-primary">
                          {row.flowWelfare}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditSingle(
                                  personnel.find((p) => p.id === row.personnelId)!,
                                )}
                                className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                                title="编辑"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(row)}
                                disabled={
                                  deletingId === row.personnelId ||
                                  !row.record
                                }
                                className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title="删除"
                              >
                                {deletingId === row.personnelId ? (
                                  <Spinner className="h-4 w-4" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页控件 */}
          {filteredPersonnel.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-textMuted">
                共 {filteredPersonnel.length} 人，第 {page}/{totalPages} 页
                {selectedCount > 0 && `，已选 ${selectedCount} 人`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer text-sm"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm text-textPrimary font-mono">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer text-sm"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 编辑模态框（单人/批量） */}
      <Modal
        open={editOpen}
        title={
          isBatchEdit
            ? `批量编辑流水（${editTargets.length} 人）`
            : '编辑流水'
        }
        onClose={() => setEditOpen(false)}
        width="max-w-3xl"
        footer={
          <>
            <button
              onClick={() => setEditOpen(false)}
              disabled={editSaving}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {editSaving && <Spinner className="h-4 w-4" />}
              {editSaving ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {/* 月份与厅信息 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-custom-sm bg-surface border border-border text-xs text-textSecondary">
            <Info size={14} className="text-primary shrink-0" />
            <span>
              厅：{branchName} ｜ 月份：{formatMonthCN(selectedMonth.slice(0, 7))}
              ｜ 倍率：{flowMultiplier}%｜ 补 0：{flowZeroCount} 个
            </span>
          </div>

          {/* 批量模式下的提示与操作 */}
          {isBatchEdit && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-textMuted">
                共 {editTargets.length} 人，每人独立录入
              </span>
              <button
                onClick={() => {
                  // 清空所有人
                  setEditTargets([])
                  setEditDrafts({})
                }}
                className="text-xs text-textSecondary hover:text-danger transition-colors duration-200 cursor-pointer"
              >
                清空
              </button>
            </div>
          )}

          {/* 人员卡片列表 */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {editTargets.length === 0 ? (
              <div className="text-center py-8 text-sm text-textMuted">
                已清空所有人员
              </div>
            ) : (
              editTargets.map((p) => {
                const draft = editDrafts[p.id] ?? { totalFlow: '' }
                const inputValue = draft.totalFlow === '' ? 0 : Number(draft.totalFlow) || 0
                const actualFlow = inputValue * flowMultiplier10
                const welfare = Math.round(actualFlow * flowMultiplier) / 100
                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-custom-sm border border-border bg-card space-y-2"
                  >
                    {/* 人员头部 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-textPrimary">
                          {p.name}
                        </span>
                        <span className="text-xs text-textMuted font-mono">
                          流水福利：{welfare}
                        </span>
                      </div>
                      {isBatchEdit && (
                        <button
                          onClick={() => removeEditTarget(p.id)}
                          className="p-1 text-textMuted hover:text-danger rounded transition-colors duration-200 cursor-pointer"
                          title="移除"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {/* 输入区 */}
                    <div>
                      <label className="block text-[10px] text-textSecondary mb-0.5">
                        总流水
                        {flowZeroCount > 0 && (
                          <span className="ml-1 text-textMuted">
                            （输入 {formatThousands(inputValue)} 实际为 {formatThousands(actualFlow)}）
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.totalFlow}
                        onChange={(e) =>
                          updateEditDraft(p.id, { totalFlow: e.target.value })
                        }
                        placeholder="0"
                        className="w-full px-2 py-1.5 border border-border rounded-custom-sm bg-card text-sm text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
