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
  exportApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import Modal from '../components/Modal'
import { TableSkeleton, Spinner } from '../components/Skeleton'
import {
  formatDate,
  formatDateTime,
  getWeekStart,
  getPreviousWeekStart,
  getWeekRangeText,
} from '../utils'
import type { DataRecord, Personnel, Branch, ImportResult } from '../types'

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

  const [form, setForm] = useState<RecordForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importTab, setImportTab] = useState<'excel' | 'paste'>('excel')
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [pasteData, setPasteData] = useState('')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<'excel' | 'csv' | null>(null)

  // 当前生效的分部ID（用于录入/导入）
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    return user?.branchId ?? undefined
  }, [isHuizhang, branchId, user])

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
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
  }, [isHuizhang])

  useEffect(() => {
    if (effectiveBranchId !== undefined || isHuizhang) {
      loadPersonnel()
    }
  }, [effectiveBranchId, isHuizhang])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, effectiveBranchId])

  const handlePrevWeek = () => setWeekStart(getPreviousWeekStart(weekStart))
  const handleNextWeek = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    if (next <= getWeekStart()) setWeekStart(next)
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请选择分部' : '当前账户未关联分部')
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
      if (editingId) {
        await dataRecordsApi.update(editingId, { sg, mx, qm })
        toast.success('修改成功')
      } else {
        await dataRecordsApi.create({
          personnelId: Number(form.personnelId),
          branchId: effectiveBranchId,
          sg,
          mx,
          qm,
        })
        toast.success('录入成功')
      }
      resetForm()
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (record: DataRecord) => {
    setEditingId(record.id)
    setForm({
      personnelId: String(record.personnelId),
      sg: String(record.sg),
      mx: String(record.mx),
      qm: String(record.qm),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      toast.error(isHuizhang ? '请选择分部' : '当前账户未关联分部')
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

  // 人员选项（过滤本周已录入的，编辑时保留当前）
  const personnelOptions = useMemo(() => {
    const recordedIds = new Set(records.map((r) => r.personnelId))
    return personnel.filter(
      (p) => !recordedIds.has(p.id) || String(p.id) === form.personnelId
    )
  }, [personnel, records, form.personnelId])

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
              <option value="">选择分部</option>
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
          {editingId ? '编辑数据' : '手动录入'}
        </h3>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <div className="lg:col-span-1">
            <label className="block text-xs text-textSecondary mb-1">人员</label>
            <select
              value={form.personnelId}
              onChange={(e) =>
                setForm({ ...form, personnelId: e.target.value })
              }
              disabled={!!editingId}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-surface disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              <option value="">请选择人员</option>
              {personnelOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
              {editingId ? '保存' : '添加'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
              >
                取消
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 数据表格：weekStart/effectiveBranchId 变化时重新触发入场动画 */}
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
                  <th className="px-4 py-3 font-medium">分部</th>
                  <th className="px-4 py-3 font-medium">收光</th>
                  <th className="px-4 py-3 font-medium">麦序</th>
                  <th className="px-4 py-3 font-medium">全麦</th>
                  <th className="px-4 py-3 font-medium">福利</th>
                  <th className="px-4 py-3 font-medium">录入时间</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-textMuted"
                    >
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  records.map((r) => (
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
    </div>
  )
}
