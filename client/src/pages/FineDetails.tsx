import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Users,
  Trash2,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { finesApi, getErrorMessage } from '../api'
import { useToast } from '../hooks/useToast'
import { formatDate } from '../utils'
import Modal from '../components/Modal'
import DatePicker from '../components/DatePicker'
import { Skeleton } from '../components/Skeleton'
import type {
  FinePersonnel,
  Fine,
  FineSummary,
  FineReasonType,
} from '../types'

const REASON_LABELS: Record<FineReasonType, string> = {
  LATE: '迟到',
  VIOLATION: '违规',
  OTHER: '其他',
}

const REASON_BADGE_CLASS: Record<FineReasonType, string> = {
  LATE: 'text-warning bg-warning/10',
  VIOLATION: 'text-danger bg-danger/10',
  OTHER: 'text-textSecondary bg-surface',
}

const PAGE_SIZE = 30

// 将 ISO 日期字符串格式化为 YYYY-MM-DD
function toDateStr(iso: string): string {
  return formatDate(new Date(iso))
}

export default function FineDetails() {
  const navigate = useNavigate()
  const toast = useToast()

  // ============ 罚款记录状态 ============
  const [fines, setFines] = useState<Fine[]>([])
  const [personnel, setPersonnel] = useState<FinePersonnel[]>([])
  const [summary, setSummary] = useState<FineSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // 筛选
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterReasonType, setFilterReasonType] = useState<FineReasonType | ''>('')

  // 弹窗：编辑罚款
  const [editOpen, setEditOpen] = useState(false)
  const [editingFine, setEditingFine] = useState<Fine | null>(null)
  const [formPersonnelId, setFormPersonnelId] = useState<number | ''>('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(formatDate(new Date()))
  const [formReasonType, setFormReasonType] = useState<FineReasonType>('OTHER')
  const [formRemark, setFormRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 删除确认
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Fine | null>(null)

  // ============ 数据加载 ============
  const loadPersonnel = async () => {
    try {
      const list = await finesApi.listPersonnel()
      setPersonnel(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const loadFines = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof finesApi.list>[0] = {}
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate
      if (filterReasonType !== '') params.reasonType = filterReasonType
      const list = await finesApi.list(params)
      setFines(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const params: Parameters<typeof finesApi.summary>[0] = {}
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate
      const s = await finesApi.summary(params)
      setSummary(s)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  useEffect(() => {
    loadPersonnel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadFines()
    loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStartDate, filterEndDate, filterReasonType])

  // 筛选变化时重置分页
  useEffect(() => {
    setPage(1)
  }, [filterStartDate, filterEndDate, filterReasonType])

  // ============ 罚款记录分页 ============
  const totalPages = Math.max(1, Math.ceil(fines.length / PAGE_SIZE))
  const pagedFines = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return fines.slice(start, start + PAGE_SIZE)
  }, [fines, page])

  // ============ 罚款记录操作 ============
  const openEdit = (fine: Fine) => {
    setEditingFine(fine)
    setFormPersonnelId(fine.personnelId)
    setFormAmount(String(fine.amount))
    setFormDate(toDateStr(fine.fineDate))
    setFormReasonType(fine.reasonType)
    setFormRemark(fine.remark ?? '')
    setEditOpen(true)
  }

  const handleSubmitFine = async () => {
    if (!editingFine) return
    if (formPersonnelId === '') {
      toast.error('请选择人员')
      return
    }
    const amount = Number(formAmount)
    if (!formAmount || !Number.isInteger(amount) || amount <= 0) {
      toast.error('罚款金额必须为正整数')
      return
    }
    setSubmitting(true)
    try {
      await finesApi.update(editingFine.id, {
        personnelId: formPersonnelId,
        amount,
        fineDate: formDate,
        reasonType: formReasonType,
        remark: formRemark.trim() || undefined,
      })
      toast.success('已修改')
      setEditOpen(false)
      loadFines()
      loadSummary()
      loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const openDelete = (fine: Fine) => {
    setDeleteTarget(fine)
    setDeleteOpen(true)
  }

  const handleDeleteFine = async () => {
    if (!deleteTarget) return
    setSubmitting(true)
    try {
      await finesApi.delete(deleteTarget.id)
      toast.success('已删除')
      setDeleteOpen(false)
      setDeleteTarget(null)
      loadFines()
      loadSummary()
      loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const hasFilter =
    filterStartDate !== '' ||
    filterEndDate !== '' ||
    filterReasonType !== ''

  const clearFilter = () => {
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterReasonType('')
  }

  return (
    <div className="space-y-5">
      {/* 顶部：返回按钮 + 标题 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/fines')}
          className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textSecondary rounded-custom-sm text-sm hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          title="返回罚款记录页"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <h2 className="text-lg font-semibold text-textPrimary">罚款明细</h2>
      </div>

      {/* 筛选栏 */}
      <div className="art-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-textSecondary mb-1">开始日期</label>
            <DatePicker
              value={filterStartDate}
              onChange={setFilterStartDate}
              allowClear
              fullWidth
              placeholder="不限"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">结束日期</label>
            <DatePicker
              value={filterEndDate}
              onChange={setFilterEndDate}
              allowClear
              fullWidth
              placeholder="不限"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">原因分类</label>
            <select
              value={filterReasonType}
              onChange={(e) =>
                setFilterReasonType(e.target.value as FineReasonType | '')
              }
              className="px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 min-w-[120px]"
            >
              <option value="">全部</option>
              <option value="LATE">迟到</option>
              <option value="VIOLATION">违规</option>
              <option value="OTHER">其他</option>
            </select>
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
        </div>
      </div>

      {/* 罚款记录明细表格 */}
      <div className="art-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <BarChart3 size={16} className="text-textSecondary" />
          <span className="text-sm font-medium text-textPrimary">
            罚款记录明细
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                <th className="px-4 py-3 font-medium">序号</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">原因分类</th>
                <th className="px-4 py-3 font-medium">备注</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pagedFines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-textMuted">
                      <BarChart3 size={32} className="opacity-40" />
                      <span className="text-sm">
                        {hasFilter ? '未找到匹配的罚款记录' : '暂无罚款记录'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedFines.map((f, idx) => (
                  <tr
                    key={f.id}
                    className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                  >
                    <td className="px-4 py-3 text-textMuted font-mono">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="px-4 py-3 text-textPrimary font-medium">
                      {f.personnel.name}
                    </td>
                    <td className="px-4 py-3 text-textPrimary">{f.amount}</td>
                    <td className="px-4 py-3 text-textSecondary">
                      {toDateStr(f.fineDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${REASON_BADGE_CLASS[f.reasonType]}`}
                      >
                        {REASON_LABELS[f.reasonType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-textSecondary">
                      {f.remark || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(f)}
                          className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                          title="编辑"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => openDelete(f)}
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
        {fines.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-xs text-textSecondary">
              共 {fines.length} 条，第 {page}/{totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-textSecondary px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 汇总明细：按人员 */}
      {summary && summary.byPersonnel.length > 0 && (
        <div className="art-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users size={16} className="text-textSecondary" />
            <span className="text-sm font-medium text-textPrimary">按人员汇总</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-textSecondary">
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">罚款次数</th>
                  <th className="px-4 py-3 font-medium">罚款总额</th>
                </tr>
              </thead>
              <tbody>
                {summary.byPersonnel
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((p) => (
                    <tr
                      key={p.personnelId}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                    >
                      <td className="px-4 py-3 text-textPrimary font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-textSecondary">{p.count}</td>
                      <td className="px-4 py-3 text-textPrimary">{p.amount}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 汇总明细：按原因分类 */}
      {summary && Object.keys(summary.byReasonType).length > 0 && (
        <div className="art-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <BarChart3 size={16} className="text-textSecondary" />
            <span className="text-sm font-medium text-textPrimary">按原因分类汇总</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-textSecondary">
                  <th className="px-4 py-3 font-medium">原因分类</th>
                  <th className="px-4 py-3 font-medium">次数</th>
                  <th className="px-4 py-3 font-medium">金额</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(summary.byReasonType) as FineReasonType[])
                  .sort()
                  .map((rt) => (
                    <tr
                      key={rt}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${REASON_BADGE_CLASS[rt]}`}
                        >
                          {REASON_LABELS[rt]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        {summary.byReasonType[rt].count}
                      </td>
                      <td className="px-4 py-3 text-textPrimary">
                        {summary.byReasonType[rt].amount}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ 编辑罚款弹窗 ============ */}
      <Modal
        open={editOpen}
        title="编辑罚款"
        onClose={() => setEditOpen(false)}
        width="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
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
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              人员 <span className="text-danger">*</span>
            </label>
            <select
              value={formPersonnelId}
              onChange={(e) =>
                setFormPersonnelId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            >
              <option value="">请选择人员</option>
              {personnel.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              金额 <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="正整数"
              className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              日期 <span className="text-danger">*</span>
            </label>
            <DatePicker
              value={formDate}
              onChange={setFormDate}
              fullWidth
              showYear
            />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">原因分类</label>
            <select
              value={formReasonType}
              onChange={(e) => setFormReasonType(e.target.value as FineReasonType)}
              className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            >
              <option value="LATE">迟到</option>
              <option value="VIOLATION">违规</option>
              <option value="OTHER">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">备注</label>
            <input
              type="text"
              maxLength={100}
              value={formRemark}
              onChange={(e) => setFormRemark(e.target.value)}
              placeholder="可选，最多100字"
              className="w-full px-3 py-2 border border-border rounded-custom-sm bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* ============ 删除罚款确认弹窗 ============ */}
      <Modal
        open={deleteOpen}
        title="删除罚款记录"
        onClose={() => setDeleteOpen(false)}
        width="max-w-sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleDeleteFine}
              disabled={submitting}
              className="px-4 py-2 bg-danger text-white rounded-custom-sm text-sm font-medium hover:bg-danger-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {submitting ? '删除中...' : '确认删除'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-textPrimary">
          确认删除 <span className="font-medium">{deleteTarget?.personnel.name}</span> 的罚款记录（金额 {deleteTarget?.amount}）？
        </p>
      </Modal>
    </div>
  )
}
