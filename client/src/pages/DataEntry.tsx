import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  Download,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  ClipboardPaste,
} from 'lucide-react'
import {
  dataRecordsApi,
  dataQueryApi,
  personnelApi,
  branchesApi,
  rankingApi,
  exportApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import Modal from '../components/Modal'
import SearchableSelect from '../components/SearchableSelect'
import { TableSkeleton, Spinner } from '../components/Skeleton'
import {
  formatDate,
  formatDateTime,
  getWeekStart,
  getPreviousWeekStart,
  getWeekRangeText,
  getMonthRangeText,
} from '../utils'
import type {
  DataRecord,
  Personnel,
  Branch,
  ImportResult,
  RankingItem,
  StatCycle,
} from '../types'

type RecordForm = {
  personnelId: string
  sg: string
  mx: string
  qm: string
}

const emptyForm: RecordForm = {
  personnelId: '',
  sg: '',
  mx: '',
  qm: '',
}

export default function DataEntry() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const canDelete = isHuizhang || user?.role === 'CHAOGUAN'

  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [records, setRecords] = useState<DataRecord[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [monthRanking, setMonthRanking] = useState<RankingItem[]>([])
  const [monthLoading, setMonthLoading] = useState(false)

  const [form, setForm] = useState<RecordForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  // 编辑弹窗独立状态
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<RecordForm>(emptyForm)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importTab, setImportTab] = useState<'excel' | 'paste'>('excel')
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [pasteData, setPasteData] = useState('')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<'excel' | 'csv' | null>(null)

  // 当前生效的厅ID（用于录入/导入）
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    return user?.branchId ?? undefined
  }, [isHuizhang, branchId, user])

  // 当前厅的统计周期（按周/按月）
  const currentCycle: StatCycle = useMemo(() => {
    const branch = branches.find((b) => b.id === effectiveBranchId)
    return branch?.statCycle ?? 'WEEK'
  }, [branches, effectiveBranchId])
  const isMonthCycle = currentCycle === 'MONTH'

  const loadData = async () => {
    setLoading(true)
    try {
      const weekParam = formatDate(weekStart)
      const [recs] = await Promise.all([
        dataQueryApi.listByWeek(weekParam, effectiveBranchId),
      ])
      setRecords(recs)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const loadPersonnel = async () => {
    try {
      const list = await personnelApi.list(effectiveBranchId)
      setPersonnel(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  useEffect(() => {
    // 所有用户都需加载厅列表以获取统计周期
    branchesApi.list().then(setBranches).catch(() => {})
  }, [])

  useEffect(() => {
    if (effectiveBranchId !== undefined || isHuizhang) {
      loadPersonnel()
    }
  }, [effectiveBranchId, isHuizhang])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, effectiveBranchId])

  // 按月统计厅：加载本月汇总（ranking 接口按厅周期聚合）
  useEffect(() => {
    if (!isMonthCycle || !effectiveBranchId) {
      setMonthRanking([])
      return
    }
    setMonthLoading(true)
    rankingApi
      .getRanking(formatDate(weekStart), effectiveBranchId)
      .then(setMonthRanking)
      .catch(() => setMonthRanking([]))
      .finally(() => setMonthLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonthCycle, effectiveBranchId, weekStart])

  const handlePrevWeek = () => setWeekStart(getPreviousWeekStart(weekStart))
  const handleNextWeek = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    if (next <= getWeekStart()) setWeekStart(next)
  }

  const resetForm = () => {
    setForm(emptyForm)
  }

  // 新建录入提交（仅 create 模式）
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }
    if (!form.personnelId) {
      toast.error('请选择人员')
      return
    }
    const sg = Number(form.sg)
    const mx = Number(form.mx)
    const qm = Number(form.qm)
    if (
      !Number.isInteger(sg) ||
      sg < 0 ||
      !Number.isInteger(mx) ||
      mx < 0 ||
      !Number.isInteger(qm) ||
      qm < 0
    ) {
      toast.error('收光/麦序/全麦必须为非负整数')
      return
    }

    setSubmitting(true)
    try {
      // 判断是否为累加录入（该人员本周已有记录）
      const existing = records.find(
        (r) => r.personnelId === Number(form.personnelId)
      )
      await dataRecordsApi.create({
        personnelId: Number(form.personnelId),
        branchId: effectiveBranchId,
        sg,
        mx,
        qm,
      })
      toast.success(existing ? '已累加到现有记录' : '录入成功')
      resetForm()
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  // 打开编辑弹窗
  const handleEdit = (record: DataRecord) => {
    setEditingId(record.id)
    setEditForm({
      personnelId: String(record.personnelId),
      sg: String(record.sg),
      mx: String(record.mx),
      qm: String(record.qm),
    })
    setEditModalOpen(true)
  }

  // 编辑弹窗提交
  const handleEditSubmit = async () => {
    if (!editingId) return
    if (!editForm.personnelId) {
      toast.error('请选择人员')
      return
    }
    const sg = Number(editForm.sg)
    const mx = Number(editForm.mx)
    const qm = Number(editForm.qm)
    if (
      !Number.isInteger(sg) ||
      sg < 0 ||
      !Number.isInteger(mx) ||
      mx < 0 ||
      !Number.isInteger(qm) ||
      qm < 0
    ) {
      toast.error('收光/麦序/全麦必须为非负整数')
      return
    }

    setEditSubmitting(true)
    try {
      const payload: {
        sg: number
        mx: number
        qm: number
        personnelId?: number
      } = { sg, mx, qm }
      const original = records.find((r) => r.id === editingId)
      if (original && original.personnelId !== Number(editForm.personnelId)) {
        payload.personnelId = Number(editForm.personnelId)
      }
      await dataRecordsApi.update(editingId, payload)
      toast.success('修改成功')
      setEditModalOpen(false)
      setEditingId(null)
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除该条数据记录？')) return
    try {
      await dataRecordsApi.delete(id)
      toast.success('删除成功')
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleExport = async (type: 'excel' | 'csv') => {
    setExporting(type)
    try {
      const weekParam = formatDate(weekStart)
      const blob =
        type === 'excel'
          ? await exportApi.exportExcel(weekParam, effectiveBranchId)
          : await exportApi.exportCSV(weekParam, effectiveBranchId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `周排名_${weekParam}.${type === 'excel' ? 'xlsx' : 'csv'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('导出成功')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  const handleImport = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }
    setImporting(true)
    try {
      let result: ImportResult
      if (importTab === 'excel') {
        if (!excelFile) {
          toast.error('请选择Excel文件')
          setImporting(false)
          return
        }
        result = await dataRecordsApi.importExcel(excelFile, effectiveBranchId)
      } else {
        if (!pasteData.trim()) {
          toast.error('请粘贴数据')
          setImporting(false)
          return
        }
        result = await dataRecordsApi.importPaste(pasteData, effectiveBranchId)
      }
      toast.success(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`)
      if (result.failures.length > 0) {
        console.warn('导入失败详情：', result.failures)
      }
      setImportOpen(false)
      setExcelFile(null)
      setPasteData('')
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  // 人员选项（仅显示名称）
  const personnelOptions = useMemo(() => {
    return personnel.map((p) => ({
      value: String(p.id),
      label: p.name,
    }))
  }, [personnel])

  // 人员选中：自动切换到其所在厅（会长模式），表格同步过滤只显示其数据
  const handlePersonnelSelect = (val: string) => {
    setForm({ ...form, personnelId: val })
    if (val && isHuizhang) {
      const p = personnel.find((x) => x.id === Number(val))
      const firstBranch = p?.branches?.[0]
      if (firstBranch && firstBranch.id !== branchId) {
        setBranchId(firstBranch.id)
      }
    }
  }

  // 表格过滤：选中人员时仅显示其数据
  const filteredRecords = useMemo(() => {
    if (!form.personnelId) return records
    return records.filter((r) => r.personnelId === Number(form.personnelId))
  }, [records, form.personnelId])

  return (
    <div className="space-y-5">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="px-4 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary min-w-[220px] text-center">
            {getWeekRangeText(weekStart)}
          </div>
          <button
            onClick={handleNextWeek}
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart())}
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            本周
          </button>
          {effectiveBranchId && (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                isMonthCycle
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              }`}
              title={isMonthCycle ? '该厅按月统计，数据按月汇总' : '该厅按周统计'}
            >
              {isMonthCycle ? '按月统计' : '按周统计'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isHuizhang && (
            <select
              value={branchId ?? ''}
              onChange={(e) =>
                setBranchId(e.target.value ? Number(e.target.value) : undefined)
              }
              className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            >
              <option value="">选择厅</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setImportOpen(true)}
            disabled={!effectiveBranchId && !isHuizhang}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary hover:text-textPrimary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            <Upload size={16} />
            导入
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {exporting === 'excel' ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Download size={16} />
            )}
            导出Excel
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {exporting === 'csv' ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Download size={16} />
            )}
            CSV
          </button>
        </div>
      </div>

      {/* 录入表单 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-base font-semibold text-textPrimary mb-4">
          手动录入
        </h3>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <div className="lg:col-span-1">
            <label className="block text-xs text-textSecondary mb-1">人员</label>
            <SearchableSelect
              value={form.personnelId}
              onChange={handlePersonnelSelect}
              options={personnelOptions}
              placeholder="搜索人员姓名"
              emptyText="无匹配人员"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">收光</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.sg}
              onChange={(e) => setForm({ ...form, sg: e.target.value })}
              placeholder="0"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">麦序</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.mx}
              onChange={(e) => setForm({ ...form, mx: e.target.value })}
              placeholder="0"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">全麦</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.qm}
              onChange={(e) => setForm({ ...form, qm: e.target.value })}
              placeholder="0"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {submitting ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Plus size={16} />
              )}
              添加
            </button>
          </div>
        </form>
      </div>

      {/* 按月统计厅：本月汇总卡片（ranking 接口按月聚合） */}
      <AnimatePresence mode="wait">
        {isMonthCycle && effectiveBranchId && (
          <motion.div
            key={`month-${formatDate(weekStart)}-${effectiveBranchId}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card border border-amber-200 dark:border-amber-900/40 rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-textPrimary">
                  本月汇总
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  {getMonthRangeText(weekStart)}（按月统计，汇总本月各周数据）
                </p>
              </div>
            </div>
            {monthLoading ? (
              <div className="px-5 py-8 text-center text-sm text-textMuted">
                加载中...
              </div>
            ) : monthRanking.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-textMuted">
                本月暂无数据
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface border-b border-border">
                    <tr className="text-left text-textSecondary">
                      <th className="px-4 py-3 font-medium">排名</th>
                      <th className="px-4 py-3 font-medium">人员</th>
                      <th className="px-4 py-3 font-medium">收光</th>
                      <th className="px-4 py-3 font-medium">麦序</th>
                      <th className="px-4 py-3 font-medium">全麦</th>
                      <th className="px-4 py-3 font-medium">总福利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRanking.map((r) => (
                      <tr
                        key={`${r.branchId}-${r.personnelId}`}
                        className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                      >
                        <td className="px-4 py-3 text-textPrimary font-mono">
                          {r.rank <= 3 ? (
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                                r.rank === 1
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                  : r.rank === 2
                                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                  : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                              }`}
                            >
                              {r.rank}
                            </span>
                          ) : (
                            r.rank
                          )}
                        </td>
                        <td className="px-4 py-3 text-textPrimary">
                          {r.personnelName}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-mono">{r.sg}</td>
                        <td className="px-4 py-3 text-textPrimary font-mono">{r.mx}</td>
                        <td className="px-4 py-3 text-textPrimary font-mono">{r.qm}</td>
                        <td className="px-4 py-3 text-textPrimary font-mono">
                          {r.totalWelfare}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 本周录入明细：weekStart/effectiveBranchId 变化时重新触发入场动画 */}
      {isMonthCycle && (
        <div className="text-sm font-medium text-textSecondary px-1">
          本周录入明细（{getWeekRangeText(weekStart)}）
        </div>
      )}
      <AnimatePresence mode="wait">
      <motion.div
        key={`${formatDate(weekStart)}-${effectiveBranchId ?? 'all'}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
      {loading && records.length === 0 ? (
        <TableSkeleton rows={6} columns={8} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-textSecondary">
                  <th className="px-4 py-3 font-medium">人员</th>
                  <th className="px-4 py-3 font-medium">厅</th>
                  <th className="px-4 py-3 font-medium">收光</th>
                  <th className="px-4 py-3 font-medium">麦序</th>
                  <th className="px-4 py-3 font-medium">全麦</th>
                  <th className="px-4 py-3 font-medium">福利</th>
                  <th className="px-4 py-3 font-medium">录入时间</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-textMuted"
                    >
                      {form.personnelId ? '该人员本周暂无数据' : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                    >
                      <td className="px-4 py-3 text-textPrimary">
                        {r.personnelName || r.personnel?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        {r.branchName || r.branch?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">{r.sg}</td>
                      <td className="px-4 py-3 text-textPrimary font-mono">{r.mx}</td>
                      <td className="px-4 py-3 text-textPrimary font-mono">{r.qm}</td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {r.welfare ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-textMuted text-xs">
                        {r.createdAt ? formatDateTime(r.createdAt) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(r)}
                            className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                            title="编辑"
                          >
                            <Pencil size={16} />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </motion.div>
      </AnimatePresence>

      {/* 导入弹窗 */}
      <Modal
        open={importOpen}
        title="导入数据"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <button
              onClick={() => setImportOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {importing && <Spinner className="h-4 w-4" />}
              {importing ? '导入中...' : '开始导入'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Tab 切换 */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setImportTab('excel')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
                importTab === 'excel'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-textSecondary hover:text-textPrimary'
              }`}
            >
              <FileSpreadsheet size={16} />
              Excel上传
            </button>
            <button
              onClick={() => setImportTab('paste')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
                importTab === 'paste'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-textSecondary hover:text-textPrimary'
              }`}
            >
              <ClipboardPaste size={16} />
              表格粘贴
            </button>
          </div>

          {importTab === 'excel' ? (
            <div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-textSecondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:text-sm file:font-medium hover:file:bg-primary-hover cursor-pointer"
              />
              {excelFile && (
                <p className="mt-2 text-xs text-textSecondary">
                  已选择：{excelFile.name}
                </p>
              )}
              <p className="mt-3 text-xs text-textMuted">
                Excel 格式：第一列为姓名，第二列收光，第三列麦序，第四列全麦。第一行为表头将被跳过。
              </p>
            </div>
          ) : (
            <div>
              <textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder={
                  '姓名\t收光\t麦序\t全麦\n张三\t10\t40\t5\n李四\t8\t35\t3'
                }
                rows={8}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 resize-y"
              />
              <p className="mt-2 text-xs text-textMuted">
                支持Tab分隔或逗号分隔，第一行若包含"姓名"将被视为表头跳过。
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* 编辑记录弹窗 */}
      <Modal
        open={editModalOpen}
        title="编辑数据"
        onClose={() => {
          setEditModalOpen(false)
          setEditingId(null)
        }}
        footer={
          <>
            <button
              onClick={() => {
                setEditModalOpen(false)
                setEditingId(null)
              }}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleEditSubmit}
              disabled={editSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {editSubmitting && <Spinner className="h-4 w-4" />}
              {editSubmitting ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 人员 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">人员</label>
            <SearchableSelect
              value={editForm.personnelId}
              onChange={(val) => setEditForm({ ...editForm, personnelId: val })}
              options={personnelOptions}
              placeholder="搜索人员姓名"
              emptyText="无匹配人员"
            />
          </div>
          {/* 收光 / 麦序 / 全麦 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">收光</label>
              <input
                type="number"
                min={0}
                step={1}
                value={editForm.sg}
                onChange={(e) => setEditForm({ ...editForm, sg: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">麦序</label>
              <input
                type="number"
                min={0}
                step={1}
                value={editForm.mx}
                onChange={(e) => setEditForm({ ...editForm, mx: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">全麦</label>
              <input
                type="number"
                min={0}
                step={1}
                value={editForm.qm}
                onChange={(e) => setEditForm({ ...editForm, qm: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
