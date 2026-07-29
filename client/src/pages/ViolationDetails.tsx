import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  Search,
  Trash2,
  Pencil,
  X,
  Info,
  RefreshCw,
} from 'lucide-react'
import {
  violationRecordsApi,
  violationItemsApi,
  branchesApi,
  branchGroupsApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { matchNamePinyin, formatMonthCN, formatDate } from '../utils'
import { Skeleton, Spinner } from '../components/Skeleton'
import GroupedSelect from '../components/GroupedSelect'
import DatePicker from '../components/DatePicker'
import Modal from '../components/Modal'
import type { ViolationItem, ViolationRecord, BranchGroup } from '../types'

const PAGE_SIZE = 50

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

interface EditForm {
  personnelId: string
  violationItemId: string
  violationDate: string
  remark: string
}

const emptyForm: EditForm = {
  personnelId: '',
  violationItemId: '',
  violationDate: formatDate(new Date()),
  remark: '',
}

export default function ViolationDetails() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canEdit = isHuizhang || isChaoguan

  const [branches, setBranches] = useState<
    { id: number; name: string; statCycle: 'WEEK' | 'MONTH'; closed: boolean }[]
  >([])
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined)
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [records, setRecords] = useState<ViolationRecord[]>([])
  const [violationItems, setViolationItems] = useState<ViolationItem[]>([])
  const [allMonths, setAllMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('') // '' 表示全部

  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 编辑模态框
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyForm)
  const [editSaving, setEditSaving] = useState(false)

  // 厅选择
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    if (isChaoguan) return branchId ?? user?.branchId ?? undefined
    return user?.branchId ?? undefined
  }, [isHuizhang, isChaoguan, branchId, user])

  const isGroupMode = selectedGroupId !== undefined
  const selectedGroup = useMemo(
    () => branchGroups.find((g) => g.id === selectedGroupId),
    [branchGroups, selectedGroupId],
  )
  const groupBranchIds = useMemo(() => {
    if (!isGroupMode || !selectedGroup) return []
    return selectedGroup.branches.filter((b) => !b.closed).map((b) => b.id)
  }, [isGroupMode, selectedGroup])
  const queryBranchIds = useMemo(() => {
    if (isGroupMode) return groupBranchIds
    return effectiveBranchId !== undefined ? [effectiveBranchId] : []
  }, [isGroupMode, groupBranchIds, effectiveBranchId])
  const hasBranchSelected = queryBranchIds.length > 0

  // 加载厅列表
  useEffect(() => {
    branchesApi
      .list()
      .then((list) =>
        setBranches(
          list.map((b) => ({
            id: b.id,
            name: b.name,
            statCycle: b.statCycle,
            closed: b.closed ?? false,
          })),
        ),
      )
      .catch(() => {})
    branchGroupsApi
      .list()
      .then(setBranchGroups)
      .catch(() => {})
  }, [])

  // 厅名映射
  const branchNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of branches) m.set(b.id, b.name)
    if (selectedGroup) {
      for (const b of selectedGroup.branches) m.set(b.id, b.name)
    }
    return m
  }, [branches, selectedGroup])

  // 加载月份列表（查询所有成员厅的月份合并去重）
  const loadMonths = async () => {
    if (queryBranchIds.length === 0) {
      setAllMonths([currentMonthStart()])
      return
    }
    try {
      const monthsLists = await Promise.all(
        queryBranchIds.map((bid) => violationRecordsApi.listMonths(bid)),
      )
      const all = monthsLists
        .flat()
        .map((m) => normalizeMonthStart(m))
      const unique = Array.from(new Set(all)).sort((a, b) => b.localeCompare(a))
      setAllMonths(unique.length > 0 ? unique : [currentMonthStart()])
    } catch (err) {
      toast.error(getErrorMessage(err))
      setAllMonths([currentMonthStart()])
    }
  }

  // 加载违规项目配置
  const loadViolationItems = async () => {
    if (queryBranchIds.length === 0) {
      setViolationItems([])
      return
    }
    try {
      const lists = await Promise.all(
        queryBranchIds.map((bid) => violationItemsApi.list(bid)),
      )
      if (!isGroupMode) {
        setViolationItems(lists[0] ?? [])
        return
      }
      const seen = new Set<string>()
      const merged: ViolationItem[] = []
      for (const list of lists) {
        for (const item of list) {
          if (seen.has(item.name)) continue
          seen.add(item.name)
          merged.push(item)
        }
      }
      setViolationItems(merged)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setViolationItems([])
    }
  }

  // 加载违规记录：selectedMonth 为空时查询所有月份
  const loadRecords = async () => {
    if (queryBranchIds.length === 0) {
      setRecords([])
      return
    }
    try {
      const monthsToQuery =
        selectedMonth !== '' ? [selectedMonth] : allMonths
      const lists = await Promise.all(
        queryBranchIds.flatMap((bid) =>
          monthsToQuery.map((m) =>
            violationRecordsApi.list({ branchId: bid, periodStart: m }),
          ),
        ),
      )
      const merged = lists.flat().sort((a, b) => {
        const da = a.violationDate ?? ''
        const db = b.violationDate ?? ''
        return db.localeCompare(da)
      })
      setRecords(merged)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setRecords([])
    }
  }

  const reloadAll = async () => {
    setLoading(true)
    await Promise.all([loadMonths(), loadViolationItems(), loadRecords()])
    setLoading(false)
  }

  useEffect(() => {
    if (queryBranchIds.length > 0) {
      reloadAll()
    } else {
      setRecords([])
      setViolationItems([])
      setAllMonths([currentMonthStart()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryBranchIds, selectedMonth])

  // 切换厅/搜索时重置分页
  useEffect(() => {
    setPage(1)
  }, [searchTerm, queryBranchIds, selectedMonth])

  // 违规项目映射
  const itemMap = useMemo(() => {
    const m = new Map<number, ViolationItem>()
    for (const it of violationItems) m.set(it.id, it)
    for (const r of records) {
      if (r.item && !m.has(r.violationItemId)) {
        m.set(r.violationItemId, {
          id: r.item.id,
          branchId: r.branchId,
          name: r.item.name,
          deductionAmount: r.item.deductionAmount,
          thresholdCount: r.item.thresholdCount,
          createdAt: '',
          updatedAt: '',
        })
      }
    }
    return m
  }, [violationItems, records])

  // 人员名映射
  const personnelNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const r of records) {
      if (r.personnel?.name) m.set(r.personnelId, r.personnel.name)
    }
    return m
  }, [records])

  // 搜索过滤
  const filteredRecords = useMemo(() => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return records
    return records.filter((r) => {
      const name = r.personnel?.name ?? personnelNameMap.get(r.personnelId) ?? ''
      return matchNamePinyin(name, trimmed)
    })
  }, [records, searchTerm, personnelNameMap])

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRecords = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredRecords.slice(start, start + PAGE_SIZE)
  }, [filteredRecords, safePage])

  // 违规项目下拉选项
  const itemOptions = useMemo(
    () =>
      violationItems.map((it) => ({
        value: String(it.id),
        label: it.name,
      })),
    [violationItems],
  )

  // 当前编辑的违规项目详情
  const editingItem = useMemo(() => {
    if (!editForm.violationItemId) return undefined
    return itemMap.get(Number(editForm.violationItemId))
  }, [editForm.violationItemId, itemMap])

  // ============ 编辑单条违规记录 ============
  const openEdit = (record: ViolationRecord) => {
    setEditingId(record.id)
    setEditForm({
      personnelId: String(record.personnelId),
      violationItemId: String(record.violationItemId),
      violationDate: record.violationDate,
      remark: record.remark ?? '',
    })
    setEditOpen(true)
  }

  const handleEditSave = async () => {
    if (!hasBranchSelected) return
    if (!editForm.violationItemId) {
      toast.error('请选择违规项目')
      return
    }
    if (!editForm.violationDate) {
      toast.error('请选择违规日期')
      return
    }
    setEditSaving(true)
    try {
      await violationRecordsApi.update(editingId!, {
        violationItemId: Number(editForm.violationItemId),
        violationDate: editForm.violationDate,
        periodStart: normalizeMonthStart(editForm.violationDate),
        remark: editForm.remark.trim() || undefined,
      })
      toast.success('违规记录已更新')
      setEditOpen(false)
      await loadRecords()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setEditSaving(false)
    }
  }

  // 删除单条
  const handleDelete = async (record: ViolationRecord) => {
    setDeletingId(record.id)
    try {
      await violationRecordsApi.delete(record.id)
      toast.success('已删除')
      await Promise.all([loadRecords(), loadMonths()])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  // 厅选择下拉分组
  const branchSelectGroups = useMemo(() => {
    const groupOpts = branchGroups.map((g) => ({
      label: g.name,
      options: g.branches
        .filter((b) => !b.closed)
        .map(() => ({ value: `g${g.id}`, label: g.name })),
    }))
    const branchOpts = branches
      .filter((b) => !b.closed)
      .map((b) => ({ value: String(b.id), label: b.name }))
    return [
      ...(groupOpts.length > 0
        ? [{ label: '合厅组', options: groupOpts.flatMap((g) => g.options) }]
        : []),
      { label: '独立厅', options: branchOpts },
    ]
  }, [branchGroups, branches])

  // 月份下拉选项（包含"全部"）
  const monthOptions = useMemo(() => {
    const opts = allMonths.map((m) => ({
      value: m,
      label: formatMonthCN(m.slice(0, 7)),
    }))
    return [{ value: '', label: '全部月份' }, ...opts]
  }, [allMonths])

  // 表格列数
  const columnCount = 4 + (canEdit ? 1 : 0) + (isGroupMode || !selectedGroupId ? 1 : 0)

  // 当前编辑的违规日期范围
  const editMonthStart = editForm.violationDate
    ? normalizeMonthStart(editForm.violationDate)
    : currentMonthStart()

  return (
    <div className="space-y-5">
      {/* 顶部：返回按钮 + 标题 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/violations')}
          className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textSecondary rounded-custom-sm text-sm hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          title="返回违规标记页"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <h2 className="text-lg font-semibold text-textPrimary">违规记录明细</h2>
        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          {filteredRecords.length} 条
        </span>
      </div>

      {/* 筛选栏 */}
      <div className="art-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* 厅/合厅组选择 */}
          <div className="min-w-[180px]">
            <label className="block text-xs text-textSecondary mb-1">厅/合厅组</label>
            <GroupedSelect
              value={
                isGroupMode
                  ? `g${selectedGroupId}`
                  : branchId !== undefined
                    ? String(branchId)
                    : ''
              }
              onChange={(val) => {
                if (val.startsWith('g')) {
                  setSelectedGroupId(Number(val.slice(1)))
                  setBranchId(undefined)
                } else {
                  setSelectedGroupId(undefined)
                  setBranchId(val ? Number(val) : undefined)
                }
              }}
              placeholder="选择厅"
              topOption={isHuizhang ? { value: '', label: '选择厅' } : undefined}
              groups={branchSelectGroups}
              fullWidth
            />
          </div>

          {/* 月份选择 */}
          <div className="min-w-[140px]">
            <label className="block text-xs text-textSecondary mb-1">月份</label>
            <GroupedSelect
              value={selectedMonth}
              onChange={(val) => setSelectedMonth(val)}
              placeholder="选择月份"
              options={monthOptions}
              fullWidth
            />
          </div>

          {/* 人员搜索 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-textSecondary mb-1">人员搜索</label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="按姓名/拼音首字母搜索"
                className="w-full pl-9 pr-9 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-textMuted hover:text-textPrimary rounded transition-colors duration-200 cursor-pointer"
                  title="清除"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* 刷新 */}
          <button
            onClick={reloadAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textSecondary rounded-custom-sm text-sm hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 未选厅时提示 */}
      {!hasBranchSelected ? (
        <div className="art-card px-5 py-16 text-center text-sm text-textMuted">
          请先选择厅
        </div>
      ) : (
        <div className="art-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-textSecondary">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">日期</th>
                  <th className="px-4 py-3 font-medium">人员</th>
                  <th className="px-4 py-3 font-medium">所属厅</th>
                  <th className="px-4 py-3 font-medium">违规项目</th>
                  <th className="px-4 py-3 font-medium">备注</th>
                  {canEdit && (
                    <th className="px-4 py-3 font-medium text-right">操作</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {Array.from({ length: columnCount }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : pagedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="px-4 py-16 text-center text-textMuted">
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle size={32} className="opacity-40" />
                        <span className="text-sm">
                          {searchTerm ? '未找到匹配的记录' : '暂无违规记录'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedRecords.map((r) => {
                    const pItem = itemMap.get(r.violationItemId)
                    const itemName =
                      pItem?.name ?? r.item?.name ?? `项目${r.violationItemId}`
                    const pName =
                      r.personnel?.name ??
                      personnelNameMap.get(r.personnelId) ??
                      `人员${r.personnelId}`
                    const bName =
                      r.branch?.name ?? branchNameMap.get(r.branchId) ?? '-'
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                      >
                        <td className="px-4 py-3 text-textSecondary font-mono whitespace-nowrap">
                          {r.violationDate}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-medium whitespace-nowrap">
                          {pName}
                        </td>
                        <td className="px-4 py-3 text-textSecondary text-xs whitespace-nowrap">
                          {bName}
                        </td>
                        <td className="px-4 py-3 text-textPrimary">
                          <span className="inline-flex items-center gap-1.5">
                            <AlertTriangle size={12} className="text-amber-500" />
                            {itemName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-textSecondary max-w-[240px] truncate">
                          {r.remark || '-'}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(r)}
                                className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                                title="编辑"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(r)}
                                disabled={deletingId === r.id}
                                className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title="删除"
                              >
                                {deletingId === r.id ? (
                                  <Spinner className="h-3.5 w-3.5" />
                                ) : (
                                  <Trash2 size={14} />
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

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
              <span className="text-textSecondary">
                第 {safePage} / {totalPages} 页（共 {filteredRecords.length} 条）
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  title="上一页"
                >
                  <ArrowLeft size={16} className="rotate-180" />
                </button>
                <span className="px-3 text-textPrimary font-mono">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  title="下一页"
                >
                  <ArrowLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 编辑单条违规记录 Modal */}
      <Modal
        open={editOpen}
        title="编辑违规记录"
        onClose={() => setEditOpen(false)}
        width="max-w-lg"
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
        <div className="space-y-4">
          {/* 周期信息 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-custom-sm bg-surface border border-border text-xs text-textSecondary">
            <Info size={14} className="text-primary shrink-0" />
            <span>
              周期：{formatMonthCN(editMonthStart.slice(0, 7))}
            </span>
          </div>

          {/* 人员（只读） */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">人员</label>
            <input
              type="text"
              value={
                personnelNameMap.get(Number(editForm.personnelId)) ??
                editForm.personnelId
              }
              disabled
              className="w-full px-3 py-2 border border-border rounded-custom-sm bg-surface text-sm text-textSecondary cursor-not-allowed"
            />
          </div>

          {/* 违规项目选择 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              违规项目 <span className="text-danger">*</span>
            </label>
            <GroupedSelect
              value={editForm.violationItemId}
              onChange={(val) =>
                setEditForm({ ...editForm, violationItemId: val })
              }
              placeholder="选择违规项目"
              fullWidth
              options={itemOptions}
            />
            {editingItem && editingItem.thresholdCount > 0 && (
              <p className="text-xs text-textMuted mt-1.5 leading-relaxed">
                达到
                <span className="font-mono text-danger font-semibold">
                  {' '}{editingItem.thresholdCount}{' '}
                </span>
                次将清空该周期福利
              </p>
            )}
          </div>

          {/* 违规日期 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              违规日期 <span className="text-danger">*</span>
            </label>
            <DatePicker
              value={editForm.violationDate}
              onChange={(val) =>
                setEditForm({ ...editForm, violationDate: val })
              }
              fullWidth
              showYear
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              备注 <span className="text-textMuted">（可选，最多 100 字）</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={editForm.remark}
              onChange={(e) =>
                setEditForm({ ...editForm, remark: e.target.value })
              }
              placeholder="可选输入框"
              className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
