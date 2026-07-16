import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ScrollText,
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
} from 'lucide-react'
import { finesApi, getErrorMessage } from '../api'
import { useToast } from '../hooks/useToast'
import { formatDate, formatMonthCN } from '../utils'
import Modal from '../components/Modal'
import DatePicker from '../components/DatePicker'
import GroupedSelect from '../components/GroupedSelect'
import type {
  FinePersonnel,
  Fine,
  FineSummary,
  FineReasonType,
} from '../types'

type Tab = 'records' | 'personnel'

const PAGE_SIZE = 30

export default function Fines() {
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('records')

  // ============ 罚款记录状态 ============
  const [fines, setFines] = useState<Fine[]>([])
  const [personnel, setPersonnel] = useState<FinePersonnel[]>([])
  const [summary, setSummary] = useState<FineSummary | null>(null)

  // 筛选：按月 + 原因分类
  const [filterMonth, setFilterMonth] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [filterReasonType, setFilterReasonType] = useState<FineReasonType | ''>('')

  // 弹窗：添加罚款（多选人员，每人独立表单项）
  const [editOpen, setEditOpen] = useState(false)
  const [multiPersonnelIds, setMultiPersonnelIds] = useState<number[]>([])
  const [multiEntries, setMultiEntries] = useState<
    Record<
      number,
      { amount: string; date: string; reasonType: FineReasonType; remark: string }
    >
  >({})
  const [submitting, setSubmitting] = useState(false)

  // ============ 罚款人员状态 ============
  const [pSearchTerm, setPSearchTerm] = useState('')
  const [pPage, setPPage] = useState(1)
  const [addPOpen, setAddPOpen] = useState(false)
  const [newPName, setNewPName] = useState('')
  // 批量导入人员
  const [importPOpen, setImportPOpen] = useState(false)
  const [importPText, setImportPText] = useState('')
  const [importPResult, setImportPResult] = useState<
    { created: number; skipped: number; total: number } | null
  >(null)
  const [importingP, setImportingP] = useState(false)
  const [renamePOpen, setRenamePOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<FinePersonnel | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deletePOpen, setDeletePOpen] = useState(false)
  const [deletePTarget, setDeletePTarget] = useState<FinePersonnel | null>(null)
  const [pSubmitting, setPSubmitting] = useState(false)

  // ============ 罚款记录页：人员列表多选/搜索 ============
  const [fPersonnelSearch, setFPersonnelSearch] = useState('')
  const [fPersonnelPage, setFPersonnelPage] = useState(1)
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<Set<number>>(
    new Set()
  )

  // 导出弹窗
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ============ 数据加载 ============
  const loadPersonnel = async () => {
    try {
      const list = await finesApi.listPersonnel()
      setPersonnel(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const loadMonths = async () => {
    try {
      const months = await finesApi.listMonths()
      setAvailableMonths(months)
      // 默认选中当前月（如果列表中存在，否则选第一个）
      setFilterMonth((prev) => {
        if (prev && months.includes(prev)) return prev
        const now = new Date()
        const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        return months.includes(cur) ? cur : (months[0] ?? '')
      })
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const loadFines = async () => {
    try {
      const params: Parameters<typeof finesApi.list>[0] = {}
      if (filterMonth) params.month = filterMonth
      if (filterReasonType !== '') params.reasonType = filterReasonType
      const list = await finesApi.list(params)
      setFines(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const loadSummary = async () => {
    try {
      const params: Parameters<typeof finesApi.summary>[0] = {}
      if (filterMonth) params.month = filterMonth
      const s = await finesApi.summary(params)
      setSummary(s)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  useEffect(() => {
    loadPersonnel()
    loadMonths()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab === 'records') {
      loadFines()
      loadSummary()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterMonth, filterReasonType])

  // ============ 罚款记录页：人员列表（带罚款统计，按当前筛选条件联动）============
  const personnelWithStats = useMemo(() => {
    const statsMap = new Map<number, { count: number; amount: number }>()
    for (const f of fines) {
      const existing = statsMap.get(f.personnelId)
      if (existing) {
        existing.count += 1
        existing.amount += f.amount
      } else {
        statsMap.set(f.personnelId, { count: 1, amount: f.amount })
      }
    }
    return personnel.map((p) => ({
      ...p,
      fineCount: statsMap.get(p.id)?.count ?? 0,
      fineAmount: statsMap.get(p.id)?.amount ?? 0,
    }))
  }, [personnel, fines])

  const filteredPersonnelForRecords = useMemo(() => {
    const trimmed = fPersonnelSearch.trim()
    if (!trimmed) return personnelWithStats
    return personnelWithStats.filter((p) => p.name.includes(trimmed))
  }, [personnelWithStats, fPersonnelSearch])

  useEffect(() => {
    setFPersonnelPage(1)
  }, [fPersonnelSearch])

  const totalFPersonnelPages = Math.max(
    1,
    Math.ceil(filteredPersonnelForRecords.length / PAGE_SIZE)
  )
  const pagedFPersonnel = useMemo(() => {
    const start = (fPersonnelPage - 1) * PAGE_SIZE
    return filteredPersonnelForRecords.slice(start, start + PAGE_SIZE)
  }, [filteredPersonnelForRecords, fPersonnelPage])

  // ============ 罚款人员分页（搜索过滤）============
  const filteredPersonnel = useMemo(() => {
    const trimmed = pSearchTerm.trim()
    if (!trimmed) return personnel
    return personnel.filter((p) => p.name.includes(trimmed))
  }, [personnel, pSearchTerm])

  useEffect(() => {
    setPPage(1)
  }, [pSearchTerm])

  const totalPPages = Math.max(1, Math.ceil(filteredPersonnel.length / PAGE_SIZE))
  const pagedPersonnelList = useMemo(() => {
    const start = (pPage - 1) * PAGE_SIZE
    return filteredPersonnel.slice(start, start + PAGE_SIZE)
  }, [filteredPersonnel, pPage])

  // ============ 罚款记录操作 ============
  const openCreate = () => {
    // 记录页选中人员时带入（1 个或多个均可）
    const ids = Array.from(selectedPersonnelIds)
    if (ids.length >= 1) {
      setMultiPersonnelIds(ids)
      const today = formatDate(new Date())
      const entries: typeof multiEntries = {}
      for (const id of ids) {
        entries[id] = {
          amount: '',
          date: today,
          reasonType: 'OTHER',
          remark: '',
        }
      }
      setMultiEntries(entries)
    } else {
      setMultiPersonnelIds([])
      setMultiEntries({})
    }
    setEditOpen(true)
  }

  // 多选人员切换
  const handleToggleMultiPersonnel = (id: number) => {
    setMultiPersonnelIds((prev) => {
      if (prev.includes(id)) {
        // 移除时同时删除对应表单项
        const next = prev.filter((x) => x !== id)
        setMultiEntries((entries) => {
          const { [id]: _removed, ...rest } = entries
          return rest
        })
        return next
      }
      // 新增时初始化默认表单项
      setMultiEntries((entries) => ({
        ...entries,
        [id]: {
          amount: '',
          date: formatDate(new Date()),
          reasonType: 'OTHER',
          remark: '',
        },
      }))
      return [...prev, id]
    })
  }

  const handleUpdateMultiEntry = (
    id: number,
    field: 'amount' | 'date' | 'reasonType' | 'remark',
    value: string
  ) => {
    setMultiEntries((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleSubmitFine = async () => {
    // 添加模式：多人多表单
    if (multiPersonnelIds.length === 0) {
      toast.error('请选择至少 1 名人员')
      return
    }
    // 校验所有金额
    const validated: {
      personnelId: number
      amount: number
      fineDate: string
      reasonType: FineReasonType
      remark: string | undefined
    }[] = []
    for (const id of multiPersonnelIds) {
      const entry = multiEntries[id]
      if (!entry) {
        toast.error('表单项缺失')
        return
      }
      const amount = Number(entry.amount)
      if (!entry.amount || !Number.isInteger(amount) || amount <= 0) {
        const name = personnel.find((p) => p.id === id)?.name ?? `人员${id}`
        toast.error(`${name} 的罚款金额必须为正整数`)
        return
      }
      validated.push({
        personnelId: id,
        amount,
        fineDate: entry.date,
        reasonType: entry.reasonType,
        remark: entry.remark.trim() || undefined,
      })
    }
    setSubmitting(true)
    try {
      let successCount = 0
      let firstError: string | null = null
      for (const item of validated) {
        try {
          await finesApi.create(item)
          successCount += 1
        } catch (err) {
          if (!firstError) firstError = getErrorMessage(err)
        }
      }
      if (successCount === validated.length) {
        toast.success(`已添加 ${successCount} 条罚款`)
      } else if (successCount > 0) {
        toast.success(
          `部分成功：${successCount}/${validated.length} 条已添加${
            firstError ? `，错误：${firstError}` : ''
          }`
        )
      } else {
        toast.error(firstError ?? '添加失败')
      }
      if (successCount > 0) {
        setEditOpen(false)
        loadFines()
        loadSummary()
        loadPersonnel()
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ============ 罚款人员操作 ============
  const openAddP = () => {
    setNewPName('')
    setAddPOpen(true)
  }

  const handleAddP = async () => {
    const name = newPName.trim()
    if (!name) {
      toast.error('姓名不能为空')
      return
    }
    if (name.length > 50) {
      toast.error('姓名不能超过50字')
      return
    }
    setPSubmitting(true)
    try {
      await finesApi.createPersonnel(name)
      toast.success('已添加')
      setAddPOpen(false)
      loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPSubmitting(false)
    }
  }

  // 批量导入人员
  const openImportP = () => {
    setImportPText('')
    setImportPResult(null)
    setImportPOpen(true)
  }

  const handleImportP = async () => {
    const names = importPText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (names.length === 0) {
      toast.error('请输入至少 1 个姓名（每行一个）')
      return
    }
    setImportingP(true)
    try {
      const result = await finesApi.batchCreatePersonnel(names)
      setImportPResult({
        created: result.created,
        skipped: result.skipped,
        total: result.total,
      })
      toast.success(`已导入 ${result.created} 人${result.skipped > 0 ? `，跳过 ${result.skipped} 人（已存在）` : ''}`)
      loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setImportingP(false)
    }
  }

  const openRenameP = (p: FinePersonnel) => {
    setRenameTarget(p)
    setRenameName(p.name)
    setRenamePOpen(true)
  }

  const handleRenameP = async () => {
    if (!renameTarget) return
    const name = renameName.trim()
    if (!name) {
      toast.error('姓名不能为空')
      return
    }
    setPSubmitting(true)
    try {
      await finesApi.updatePersonnel(renameTarget.id, name)
      toast.success('已修改')
      setRenamePOpen(false)
      setRenameTarget(null)
      loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPSubmitting(false)
    }
  }

  const openDeleteP = (p: FinePersonnel) => {
    setDeletePTarget(p)
    setDeletePOpen(true)
  }

  const handleDeleteP = async () => {
    if (!deletePTarget) return
    setPSubmitting(true)
    try {
      await finesApi.deletePersonnel(deletePTarget.id)
      toast.success('已删除')
      setDeletePOpen(false)
      setDeletePTarget(null)
      loadPersonnel()
      if (tab === 'records') {
        loadFines()
        loadSummary()
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPSubmitting(false)
    }
  }

  // ============ 罚款记录页：人员多选 ============
  const handleToggleSelectPersonnel = (id: number) => {
    setSelectedPersonnelIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleSelectAllPersonnel = () => {
    setSelectedPersonnelIds((prev) => {
      const visibleIds = pagedFPersonnel.map((p) => p.id)
      if (visibleIds.every((id) => prev.has(id))) {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      }
      const next = new Set(prev)
      visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  // ============ 罚款导出 ============
  const openExport = () => {
    setExportOpen(true)
  }

  const handleExport = async (type: 'excel' | 'csv') => {
    setExporting(true)
    try {
      const params: { personnelIds?: number[]; month?: string } = {}
      if (selectedPersonnelIds.size > 0) {
        params.personnelIds = Array.from(selectedPersonnelIds)
      }
      if (filterMonth) params.month = filterMonth

      const blob =
        type === 'excel'
          ? await finesApi.exportExcel(params)
          : await finesApi.exportCSV(params)

      // 触发下载（文件名由后端 Content-Disposition 提供，这里仅用作 fallback）
      const monthText = filterMonth ? `_${formatMonthCN(filterMonth)}` : ''
      const scopeText =
        selectedPersonnelIds.size > 0 ? `_选中${selectedPersonnelIds.size}人` : ''
      const ext = type === 'excel' ? 'xlsx' : 'csv'
      const filename = `罚款汇总${monthText}${scopeText}.${ext}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('导出成功')
      setExportOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const hasFilter = filterReasonType !== ''

  const clearFilter = () => {
    setFilterReasonType('')
  }

  return (
    <div className="space-y-5">
      {/* 顶部 Tab 切换 */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab('records')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
            tab === 'records'
              ? 'border-primary text-primary'
              : 'border-transparent text-textSecondary hover:text-textPrimary'
          }`}
        >
          <ScrollText size={16} />
          罚款记录
        </button>
        <button
          onClick={() => setTab('personnel')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
            tab === 'personnel'
              ? 'border-primary text-primary'
              : 'border-transparent text-textSecondary hover:text-textPrimary'
          }`}
        >
          <Users size={16} />
          罚款人员
        </button>
      </div>

      {/* ============ 罚款记录 Tab ============ */}
      {tab === 'records' && (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">罚款总额</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary?.totalAmount ?? 0}
              </div>
            </div>
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">罚款次数</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary?.totalCount ?? 0}
              </div>
            </div>
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">涉及人员</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary?.byPersonnel.length ?? 0}
              </div>
            </div>
          </div>

          {/* 筛选 + 操作栏 */}
          <div className="art-card p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-textSecondary mb-1">月份</label>
                <GroupedSelect
                  value={filterMonth}
                  onChange={(val) => setFilterMonth(val)}
                  minWidth={150}
                  options={availableMonths.map((m) => ({
                    value: m,
                    label: formatMonthCN(m),
                  }))}
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">原因分类</label>
                <GroupedSelect
                  value={filterReasonType}
                  onChange={(val) => setFilterReasonType(val as FineReasonType | '')}
                  minWidth={120}
                  topOption={{ value: '', label: '全部' }}
                  options={[
                    { value: 'LATE', label: '迟到' },
                    { value: 'VIOLATION', label: '违规' },
                    { value: 'OTHER', label: '其他' },
                  ]}
                />
              </div>
              {hasFilter && (
                <button
                  onClick={clearFilter}
                  className="flex items-center gap-1 px-3 py-2 border border-border bg-card text-textSecondary rounded-custom-sm text-sm hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
                >
                  <X size={14} />
                  清除筛选
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={openCreate}
                disabled={personnel.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title={personnel.length === 0 ? '请先添加罚款人员' : undefined}
              >
                <Plus size={16} />
                添加罚款
              </button>
            </div>
          </div>

          {/* 人员列表（像数据录入页，可搜索可多选） */}
          <div className="art-card overflow-hidden">
            {/* 人员列表工具栏 */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 max-w-xs min-w-[180px]">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
                  />
                  <input
                    type="text"
                    value={fPersonnelSearch}
                    onChange={(e) => setFPersonnelSearch(e.target.value)}
                    placeholder="搜索人员姓名"
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                  />
                </div>

                <span className="text-xs text-textSecondary ml-auto">
                  共 {filteredPersonnelForRecords.length} 人
                  {selectedPersonnelIds.size > 0 &&
                    `，已选 ${selectedPersonnelIds.size} 人`}
                </span>

                {selectedPersonnelIds.size > 0 && (
                  <button
                    onClick={() => setSelectedPersonnelIds(new Set())}
                    className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textSecondary hover:border-danger hover:text-danger transition-colors duration-200 cursor-pointer"
                    title="取消所有选择"
                  >
                    <X size={16} />
                    取消选择
                  </button>
                )}

                <button
                  onClick={openExport}
                  disabled={personnel.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                >
                  <Download size={16} />
                  导出
                </button>
              </div>
            </div>

            {/* 人员表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    <th className="px-4 py-3 font-medium w-10">
                      <input
                        type="checkbox"
                        checked={
                          pagedFPersonnel.length > 0 &&
                          pagedFPersonnel.every((p) =>
                            selectedPersonnelIds.has(p.id)
                          )
                        }
                        onChange={handleToggleSelectAllPersonnel}
                        className="checkbox-round cursor-pointer"
                        title="全选/取消全选（当前页）"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">序号</th>
                    <th className="px-4 py-3 font-medium">姓名</th>
                    <th className="px-4 py-3 font-medium">罚款次数</th>
                    <th className="px-4 py-3 font-medium">罚款总额</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFPersonnel.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-textMuted">
                          <Users size={32} className="opacity-40" />
                          <span className="text-sm">
                            {fPersonnelSearch
                              ? '未找到匹配的人员'
                              : personnel.length === 0
                              ? '暂无人员，请先在"罚款人员"页添加'
                              : '暂无人员'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedFPersonnel.map((p, idx) => (
                      <tr
                        key={p.id}
                        className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                          selectedPersonnelIds.has(p.id) ? 'bg-primary/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedPersonnelIds.has(p.id)}
                            onChange={() => handleToggleSelectPersonnel(p.id)}
                            className="checkbox-round cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 text-textMuted font-mono">
                          {(fPersonnelPage - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-medium">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-textSecondary">
                          {p.fineCount}
                        </td>
                        <td className="px-4 py-3 text-textPrimary">
                          {p.fineAmount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 人员列表分页 */}
            {filteredPersonnelForRecords.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-xs text-textSecondary">
                  共 {filteredPersonnelForRecords.length} 人，第 {fPersonnelPage}/
                  {totalFPersonnelPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setFPersonnelPage((p) => Math.max(1, p - 1))
                    }
                    disabled={fPersonnelPage <= 1}
                    className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-textSecondary px-2">
                    {fPersonnelPage} / {totalFPersonnelPages}
                  </span>
                  <button
                    onClick={() =>
                      setFPersonnelPage((p) =>
                        Math.min(totalFPersonnelPages, p + 1)
                      )
                    }
                    disabled={fPersonnelPage >= totalFPersonnelPages}
                    className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 查看罚款明细入口 */}
          <div className="flex justify-end">
            <button
              onClick={() => navigate('/fines/details')}
              className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textPrimary rounded-custom-sm text-sm hover:border-primary hover:text-primary transition-colors duration-200 cursor-pointer"
              title="查看罚款记录明细、按人员/原因分类汇总"
            >
              <BarChart3 size={16} />
              罚款明细
            </button>
          </div>
        </>
      )}

      {/* ============ 罚款人员 Tab ============ */}
      {tab === 'personnel' && (
        <>
          {/* 工具栏 */}
          <div className="art-card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-xs min-w-[180px]">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
                />
                <input
                  type="text"
                  value={pSearchTerm}
                  onChange={(e) => setPSearchTerm(e.target.value)}
                  placeholder="搜索人员姓名"
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                />
              </div>

              <span className="text-xs text-textSecondary ml-auto">
                共 {filteredPersonnel.length} 人
              </span>

              {/* 批量导入 */}
              <button
                onClick={openImportP}
                className="flex items-center gap-1.5 px-3 py-2 border border-primary text-primary rounded-custom-sm text-sm font-medium hover:bg-primary/5 transition-colors duration-200 cursor-pointer"
              >
                <Download size={16} className="rotate-180" />
                批量导入
              </button>

              {/* 添加人员 */}
              <button
                onClick={openAddP}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
              >
                <Plus size={16} />
                添加人员
              </button>
            </div>
          </div>

          {/* 人员表格 */}
          <div className="art-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    <th className="px-4 py-3 font-medium">序号</th>
                    <th className="px-4 py-3 font-medium">姓名</th>
                    <th className="px-4 py-3 font-medium">罚款记录数</th>
                    <th className="px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPersonnelList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-textMuted">
                          <Users size={32} className="opacity-40" />
                          <span className="text-sm">
                            {pSearchTerm ? '未找到匹配的人员' : '暂无人员'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedPersonnelList.map((p, idx) => (
                      <tr
                        key={p.id}
                        className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                      >
                        <td className="px-4 py-3 text-textMuted font-mono">
                          {(pPage - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-textSecondary">
                          {p._count?.fines ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openRenameP(p)}
                              className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                              title="改名"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => openDeleteP(p)}
                              className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {filteredPersonnel.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-xs text-textSecondary">
                  共 {filteredPersonnel.length} 人，第 {pPage}/{totalPPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPPage((p) => Math.max(1, p - 1))}
                    disabled={pPage <= 1}
                    className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-textSecondary px-2">
                    {pPage} / {totalPPages}
                  </span>
                  <button
                    onClick={() => setPPage((p) => Math.min(totalPPages, p + 1))}
                    disabled={pPage >= totalPPages}
                    className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ 新增罚款弹窗 ============ */}
      <Modal
        open={editOpen}
        title={`添加罚款${multiPersonnelIds.length > 0 ? `（${multiPersonnelIds.length} 人）` : ''}`}
        onClose={() => setEditOpen(false)}
        width="max-w-2xl"
        footer={
          <div className="flex items-center justify-between gap-2">
            {multiPersonnelIds.length > 0 ? (
              <span className="text-xs text-textSecondary">
                已选 {multiPersonnelIds.length} 人
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSubmitFine}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {multiPersonnelIds.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-textMuted">
              请先在人员列表中选中人员，再点击"添加罚款"
            </div>
          ) : (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {multiPersonnelIds.map((pid) => {
                const p = personnel.find((x) => x.id === pid)
                const entry = multiEntries[pid]
                if (!entry) return null
                return (
                  <div
                    key={pid}
                    className="border border-border rounded-custom-sm p-3 bg-surface/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-textPrimary">
                        {p?.name ?? `人员${pid}`}
                      </span>
                      <button
                        onClick={() => handleToggleMultiPersonnel(pid)}
                        className="p-1 text-textMuted hover:text-danger rounded transition-colors duration-200 cursor-pointer"
                        title="移除"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">
                          金额 <span className="text-danger">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={entry.amount}
                          onChange={(e) =>
                            handleUpdateMultiEntry(pid, 'amount', e.target.value)
                          }
                          placeholder="正整数"
                          className="w-full px-2.5 py-1.5 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">
                          日期 <span className="text-danger">*</span>
                        </label>
                        <DatePicker
                          value={entry.date}
                          onChange={(v) => handleUpdateMultiEntry(pid, 'date', v)}
                          fullWidth
                          showYear
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">
                          原因分类
                        </label>
                        <GroupedSelect
                          value={entry.reasonType}
                          onChange={(val) =>
                            handleUpdateMultiEntry(pid, 'reasonType', val)
                          }
                          fullWidth
                          options={[
                            { value: 'LATE', label: '迟到' },
                            { value: 'VIOLATION', label: '违规' },
                            { value: 'OTHER', label: '其他' },
                          ]}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-textSecondary mb-1">
                          备注
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={entry.remark}
                          onChange={(e) =>
                            handleUpdateMultiEntry(pid, 'remark', e.target.value)
                          }
                          placeholder="可选"
                          className="w-full px-2.5 py-1.5 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* ============ 新增罚款人员弹窗 ============ */}
      <Modal
        open={addPOpen}
        title="添加罚款人员"
        onClose={() => setAddPOpen(false)}
        width="max-w-sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAddPOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleAddP}
              disabled={pSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {pSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        }
      >
        <div>
          <label className="block text-sm text-textSecondary mb-1">
            姓名 <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            maxLength={50}
            value={newPName}
            onChange={(e) => setNewPName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddP()
            }}
            placeholder="请输入姓名"
            className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
          />
        </div>
      </Modal>

      {/* ============ 批量导入罚款人员弹窗 ============ */}
      <Modal
        open={importPOpen}
        title="批量导入罚款人员"
        onClose={() => setImportPOpen(false)}
        width="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setImportPOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              {importPResult ? '关闭' : '取消'}
            </button>
            {!importPResult && (
              <button
                onClick={handleImportP}
                disabled={importingP}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {importingP ? '导入中...' : '开始导入'}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          {importPResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-custom-sm">
                <Info size={16} className="text-primary" />
                <span className="text-sm text-textPrimary">
                  导入完成：共 {importPResult.total} 人，新增{' '}
                  <span className="font-medium text-primary">
                    {importPResult.created}
                  </span>{' '}
                  人
                  {importPResult.skipped > 0 && (
                    <>
                      ，跳过{' '}
                      <span className="font-medium text-textSecondary">
                        {importPResult.skipped}
                      </span>{' '}
                      人（已存在）
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-textMuted">
                可点击"关闭"返回人员列表。
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-textSecondary mb-1">
                  人员姓名 <span className="text-danger">*</span>
                </label>
                <textarea
                  value={importPText}
                  onChange={(e) => setImportPText(e.target.value)}
                  placeholder="每行输入一个姓名，例如：&#10;张三&#10;李四&#10;王五"
                  rows={10}
                  className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 resize-y font-mono"
                />
              </div>
              <div className="text-xs text-textMuted leading-relaxed">
                说明：每行一个姓名，自动去除首尾空格；同名人员会自动跳过（不重复创建）。
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ============ 重命名罚款人员弹窗 ============ */}
      <Modal
        open={renamePOpen}
        title="修改姓名"
        onClose={() => setRenamePOpen(false)}
        width="max-w-sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRenamePOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleRenameP}
              disabled={pSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {pSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        }
      >
        <div>
          <label className="block text-sm text-textSecondary mb-1">
            姓名 <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            maxLength={50}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameP()
            }}
            placeholder="请输入姓名"
            className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
          />
        </div>
      </Modal>

      {/* ============ 删除罚款人员确认弹窗 ============ */}
      <Modal
        open={deletePOpen}
        title="删除罚款人员"
        onClose={() => setDeletePOpen(false)}
        width="max-w-sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeletePOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleDeleteP}
              disabled={pSubmitting}
              className="px-4 py-2 bg-danger text-white rounded-custom-sm text-sm font-medium hover:bg-danger-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {pSubmitting ? '删除中...' : '确认删除'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-textPrimary">
          确认删除人员 <span className="font-medium">{deletePTarget?.name}</span>？
        </p>
        {(deletePTarget?._count?.fines ?? 0) > 0 && (
          <p className="text-xs text-danger mt-2">
            该人员有 {deletePTarget?._count?.fines} 条罚款记录，将一并删除。
          </p>
        )}
      </Modal>

      {/* ============ 罚款导出弹窗 ============ */}
      <Modal
        open={exportOpen}
        title="导出罚款汇总"
        onClose={() => setExportOpen(false)}
        width="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setExportOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {exporting ? '导出中...' : '导出 Excel'}
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 border border-primary text-primary rounded-custom-sm text-sm font-medium hover:bg-primary/5 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              导出 CSV
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-textSecondary">
            <Info size={16} className="text-primary" />
            <span>
              导出范围：{filterMonth ? `${formatMonthCN(filterMonth)} · ` : ''}
              {selectedPersonnelIds.size > 0
                ? `仅选中人员（${selectedPersonnelIds.size} 人）`
                : '全部人员'}
            </span>
          </div>
          <p className="text-xs text-textMuted leading-relaxed">
            说明：导出按人员汇总，金额为累计总额，不会逐条列出罚款记录。
            {filterMonth && ' 当前将仅导出所选月份的数据。'}
          </p>
        </div>
      </Modal>
    </div>
  )
}
