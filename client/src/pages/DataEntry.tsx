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
  CheckSquare,
  Save,
  UserPlus,
} from 'lucide-react'
import {
  dataRecordsApi,
  dataQueryApi,
  personnelApi,
  branchesApi,
  exportApi,
  rewardRulesApi,
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
  StatCycle,
  RewardRule,
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

  // 视图周期：用户可切换本周/本月查看
  const [viewCycle, setViewCycle] = useState<'WEEK' | 'MONTH'>('WEEK')

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

  // 导出弹窗状态：可选按周/按月 + 历史周/月
  const [exportOpen, setExportOpen] = useState(false)
  const [exportCycle, setExportCycle] = useState<'WEEK' | 'MONTH'>('WEEK')
  const [exportWeeks, setExportWeeks] = useState<string[]>([])
  const [exportDate, setExportDate] = useState<string>(formatDate(getWeekStart()))

  // 批量编辑状态
  // 选中行标识：用 `${branchId}:${personnelId}` 区分多厅下的同一人员
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // 构造行 key 的辅助函数
  const rowKey = (branchId: number | undefined, personnelId: number) =>
    `${branchId ?? 0}:${personnelId}`
  const [batchEditOpen, setBatchEditOpen] = useState(false)
  // 每行的编辑表单：行 key（`${branchId}:${personnelId}`）-> { sg, mx, qm }
  const [batchForms, setBatchForms] = useState<Record<string, { sg: string; mx: string; qm: string }>>({})
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  // 批量添加状态：表格化批量录入
  const [batchAddOpen, setBatchAddOpen] = useState(false)
  const [batchAddForms, setBatchAddForms] = useState<Record<string, { sg: string; mx: string; qm: string }>>({})
  const [batchAddSubmitting, setBatchAddSubmitting] = useState(false)

  // 当前生效的厅ID（用于录入/导入）
  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    return user?.branchId ?? undefined
  }, [isHuizhang, branchId, user])

  // 当前厅的奖励规则：用于控制收光/全麦录入开关
  const [rewardRule, setRewardRule] = useState<RewardRule | null>(null)
  // 收光/全麦是否可录入（厅规则关闭时禁用对应输入）
  const sgInputEnabled = rewardRule ? rewardRule.sgEnabled : true
  const qmInputEnabled = rewardRule ? rewardRule.qmEnabled : true

  // 当前厅的统计周期（仅用于显示标签）
  const branchCycle: StatCycle = useMemo(() => {
    const branch = branches.find((b) => b.id === effectiveBranchId)
    return branch?.statCycle ?? 'WEEK'
  }, [branches, effectiveBranchId])
  // 视图周期由用户切换决定，不再绑定厅配置
  const isMonthCycle = viewCycle === 'MONTH'

  const loadData = async () => {
    // 会长未选择厅时不加载任何数据（数据录入页面仅支持独立厅显示）
    if (!effectiveBranchId) {
      setRecords([])
      return
    }
    setLoading(true)
    try {
      if (isMonthCycle) {
        // 月模式：查询整月所有周的数据并按人员累加
        // weekStart 已是月初1号，基于年月计算该月覆盖的所有周起始（周一）
        const year = weekStart.getFullYear()
        const month = weekStart.getMonth()
        const monthStart = new Date(year, month, 1)
        const monthEnd = new Date(year, month + 1, 0) // 月末最后一天
        // 该月第一天所在周的周一
        const firstWeekStart = getWeekStart(monthStart)
        // 该月最后一天所在周的周一
        const lastWeekStart = getWeekStart(monthEnd)
        // 收集所有周一起始日期
        const weekStarts: string[] = []
        let cur = new Date(firstWeekStart)
        while (cur <= lastWeekStart) {
          weekStarts.push(formatDate(cur))
          const next = new Date(cur)
          next.setDate(next.getDate() + 7)
          cur = next
        }
        // 并发查询所有周数据
        const allResults = await Promise.all(
          weekStarts.map((w) => dataQueryApi.listByWeek(w, effectiveBranchId))
        )
        // 按 (branchId, personnelId) 合并累加，避免多厅数据混合
        const mergedMap = new Map<
          string,
          DataRecord & { sg: number; mx: number; qm: number; weekStart: string }
        >()
        for (const weekRecs of allResults) {
          for (const r of weekRecs) {
            const key = `${r.branchId}:${r.personnelId}`
            const existing = mergedMap.get(key)
            if (existing) {
              existing.sg += r.sg
              existing.mx += r.mx
              existing.qm += r.qm
            } else {
              mergedMap.set(key, { ...r })
            }
          }
        }
        setRecords([...mergedMap.values()])
      } else {
        // 周模式：查询单周数据
        const weekParam = formatDate(weekStart)
        const recs = await dataQueryApi.listByWeek(weekParam, effectiveBranchId)
        setRecords(recs)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const loadPersonnel = async () => {
    // 会长未选择厅时不加载人员（数据录入页面仅支持独立厅显示）
    if (!effectiveBranchId) {
      setPersonnel([])
      return
    }
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
    // 仅在已确定厅时加载人员（会长未选厅不加载）
    if (effectiveBranchId !== undefined) {
      loadPersonnel()
    } else {
      setPersonnel([])
    }
  }, [effectiveBranchId])

  // 加载当前厅的奖励规则（用于控制收光/全麦录入开关）
  useEffect(() => {
    if (effectiveBranchId !== undefined) {
      rewardRulesApi
        .get(effectiveBranchId)
        .then((rs) => setRewardRule(rs[0] ?? null))
        .catch(() => setRewardRule(null))
    } else {
      setRewardRule(null)
    }
  }, [effectiveBranchId])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, effectiveBranchId, isMonthCycle])

  const handlePrevWeek = () => {
    if (isMonthCycle) {
      // 月模式：往前推一个月，直接设置月初1号（避免 getWeekStart 导致月份错乱）
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth() - 1, 1)
      setWeekStart(d)
    } else {
      setWeekStart(getPreviousWeekStart(weekStart))
    }
  }
  const handleNextWeek = () => {
    if (isMonthCycle) {
      // 月模式：往后推一个月，不超过当前月
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 1)
      const thisMonthStart = new Date()
      thisMonthStart.setDate(1)
      thisMonthStart.setHours(0, 0, 0, 0)
      if (d <= thisMonthStart) setWeekStart(d)
    } else {
      const next = new Date(weekStart)
      next.setDate(next.getDate() + 7)
      if (next <= getWeekStart()) setWeekStart(next)
    }
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
    // 厅规则关闭收光/全麦转换时，对应字段强制为 0 不参与录入
    const sg = sgInputEnabled ? Number(form.sg) : 0
    const mx = Number(form.mx)
    const qm = qmInputEnabled ? Number(form.qm) : 0
    if (
      (sgInputEnabled && (!Number.isInteger(sg) || sg < 0)) ||
      !Number.isInteger(mx) ||
      mx < 0 ||
      (qmInputEnabled && (!Number.isInteger(qm) || qm < 0))
    ) {
      toast.error('收光/麦序/全麦必须为非负整数')
      return
    }

    setSubmitting(true)
    try {
      // 判断是否为累加录入（该人员本周已有记录，按厅匹配避免多厅串号）
      const existing = records.find(
        (r) =>
          r.personnelId === Number(form.personnelId) &&
          (!effectiveBranchId || r.branchId === effectiveBranchId)
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
    // 厅规则关闭收光/全麦转换时，对应字段强制为 0 不参与录入
    const sg = sgInputEnabled ? Number(editForm.sg) : 0
    const mx = Number(editForm.mx)
    const qm = qmInputEnabled ? Number(editForm.qm) : 0
    if (
      (sgInputEnabled && (!Number.isInteger(sg) || sg < 0)) ||
      !Number.isInteger(mx) ||
      mx < 0 ||
      (qmInputEnabled && (!Number.isInteger(qm) || qm < 0))
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

  // 打开导出弹窗：加载历史周次列表，默认选中当前周
  const handleOpenExport = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请先选择厅' : '当前账户未关联厅')
      return
    }
    try {
      const list = await dataQueryApi.getWeeks(effectiveBranchId)
      // 合并历史周次与本周，统一格式化 YYYY-MM-DD 去重
      const set = new Set<string>()
      list.forEach((w) => set.add(formatDate(new Date(w))))
      set.add(formatDate(getWeekStart()))
      const sorted = Array.from(set).sort().reverse()
      setExportWeeks(sorted)
      // 默认选中当前周
      setExportCycle('WEEK')
      setExportDate(formatDate(getWeekStart()))
      setExportOpen(true)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 切换导出周期时重置选中日期
  const handleExportCycleChange = (cycle: 'WEEK' | 'MONTH') => {
    setExportCycle(cycle)
    if (cycle === 'WEEK') {
      setExportDate(formatDate(getWeekStart()))
    } else {
      // 月模式：默认本月1号
      const d = new Date()
      d.setDate(1)
      setExportDate(formatDate(d))
    }
  }

  // 导出：按所选周期和日期导出 Excel/CSV
  const handleExport = async (type: 'excel' | 'csv') => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请先选择厅' : '当前账户未关联厅')
      return
    }
    setExporting(type)
    try {
      const dateParam = exportDate
      const blob =
        type === 'excel'
          ? await exportApi.exportExcel(dateParam, effectiveBranchId, exportCycle)
          : await exportApi.exportCSV(dateParam, effectiveBranchId, exportCycle)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const prefix = exportCycle === 'MONTH' ? '月排名' : '周排名'
      a.download = `${prefix}_${dateParam}.${type === 'excel' ? 'xlsx' : 'csv'}`
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

  // 导出弹窗：从历史周次提取不重复月份（每月取最早周一作为参考日）
  const exportMonths = useMemo(() => {
    const monthMap = new Map<string, string>() // YYYY-MM -> refDate(YYYY-MM-DD)
    const addMonth = (dateStr: string) => {
      const formatted = formatDate(new Date(dateStr))
      const d = new Date(formatted)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap.has(key)) monthMap.set(key, formatted)
    }
    exportWeeks.forEach(addMonth)
    // 补充本月
    const thisMonthStart = new Date()
    thisMonthStart.setDate(1)
    addMonth(formatDate(thisMonthStart))
    return Array.from(monthMap.entries())
      .map(([key, ref]) => ({ key, ref }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [exportWeeks])

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

  // 多选：切换某行选中状态（按 `${branchId}:${personnelId}` 区分多厅下的同一人员）
  const handleToggleSelect = (branchId: number | undefined, personnelId: number) => {
    const key = rowKey(branchId, personnelId)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 表格数据：所有人员都显示，未录入的显示空行
  // 行数据：已录入的记录 + 未录入的人员占位行
  type DisplayRow = {
    key: string
    id: number
    personnelId: number
    branchId?: number
    personnelName: string
    branchName?: string
    sg: number
    mx: number
    qm: number
    welfare?: number
    createdAt?: string
    isRecorded: boolean
  }
  const filteredRecords = useMemo<DisplayRow[]>(() => {
    // 已录入的记录（按筛选条件过滤）
    const filtered = form.personnelId
      ? records.filter((r) => r.personnelId === Number(form.personnelId))
      : records
    // 已录入的人员标识集合：用 `${branchId}:${personnelId}` 区分多厅
    const recordedKeys = new Set(
      records.map((r) => `${r.branchId}:${r.personnelId}`)
    )
    // 未录入的人员（未选中筛选时显示所有，选中时仅显示该人员）
    const targetPersonnel = form.personnelId
      ? personnel.filter((p) => p.id === Number(form.personnelId))
      : personnel
    // 未录入：单厅模式匹配该厅，全部厅模式只要任一厅有记录就不算未录入
    const unrecorded = targetPersonnel.filter((p) => {
      if (effectiveBranchId) {
        return !recordedKeys.has(`${effectiveBranchId}:${p.id}`)
      }
      return !records.some((r) => r.personnelId === p.id)
    })
    return [
      ...filtered.map((r) => ({
        key: `rec-${r.id}`,
        id: r.id,
        personnelId: r.personnelId,
        branchId: r.branchId,
        personnelName: r.personnelName || r.personnel?.name || '-',
        branchName: r.branchName || r.branch?.name || '-',
        sg: r.sg,
        mx: r.mx,
        qm: r.qm,
        welfare: r.welfare,
        createdAt: r.createdAt,
        isRecorded: true,
      })),
      ...unrecorded.map((p) => ({
        key: `empty-${p.id}`,
        id: 0,
        personnelId: p.id,
        branchId: effectiveBranchId ?? p.branches?.[0]?.id,
        personnelName: p.name,
        branchName:
          p.branches?.find((b) => !effectiveBranchId || b.id === effectiveBranchId)
            ?.name || p.branches?.[0]?.name,
        sg: 0,
        mx: 0,
        qm: 0,
        welfare: undefined,
        createdAt: undefined,
        isRecorded: false,
      })),
    ]
  }, [records, personnel, form.personnelId, effectiveBranchId])

  // 全选/取消全选（仅当前可见行，按行 key 区分多厅）
  const handleToggleSelectAll = () => {
    setSelectedKeys((prev) => {
      const visibleKeys = filteredRecords.map((r) => rowKey(r.branchId, r.personnelId))
      if (visibleKeys.every((k) => prev.has(k))) {
        // 全部已选中：取消选中当前可见行
        const next = new Set(prev)
        visibleKeys.forEach((k) => next.delete(k))
        return next
      }
      // 未全选：选中所有可见行
      const next = new Set(prev)
      visibleKeys.forEach((k) => next.add(k))
      return next
    })
  }

  // 打开批量编辑弹窗：初始化每个选中行的表单数据
  const handleOpenBatchEdit = () => {
    if (selectedKeys.size === 0) {
      toast.error('请先勾选要批量编辑的人员')
      return
    }
    const forms: Record<string, { sg: string; mx: string; qm: string }> = {}
    filteredRecords.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId)
      if (selectedKeys.has(key)) {
        forms[key] = {
          sg: r.isRecorded ? String(r.sg) : '',
          mx: r.isRecorded ? String(r.mx) : '',
          qm: r.isRecorded ? String(r.qm) : '',
        }
      }
    })
    setBatchForms(forms)
    setBatchEditOpen(true)
  }

  // 批量编辑：更新某行某字段
  const handleBatchFieldChange = (
    key: string,
    field: 'sg' | 'mx' | 'qm',
    value: string
  ) => {
    setBatchForms((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }))
  }

  // 批量保存：逐条 create/update
  const handleBatchSubmit = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }
    // 校验所有表单数据
    const entries = Object.entries(batchForms)
    if (entries.length === 0) {
      toast.error('无数据可保存')
      return
    }
    // 解析并校验（key 格式为 `${branchId}:${personnelId}`）
    const parsed: Array<{
      personnelId: number
      branchId: number
      sg: number
      mx: number
      qm: number
      recordId: number // 0 表示未录入需新建
    }> = []
    for (const [key, f] of entries) {
      const [bidStr, pidStr] = key.split(':')
      const branchId = Number(bidStr)
      const personnelId = Number(pidStr)
      // 厅规则关闭收光/全麦转换时，对应字段强制为 0 不参与录入
      const sg = sgInputEnabled ? Number(f.sg) : 0
      const mx = Number(f.mx)
      const qm = qmInputEnabled ? Number(f.qm) : 0
      if (
        (sgInputEnabled && (!Number.isInteger(sg) || sg < 0)) ||
        !Number.isInteger(mx) ||
        mx < 0 ||
        (qmInputEnabled && (!Number.isInteger(qm) || qm < 0))
      ) {
        toast.error('收光/麦序/全麦必须为非负整数')
        return
      }
      const row = filteredRecords.find(
        (r) => r.personnelId === personnelId && r.branchId === branchId
      )
      parsed.push({
        personnelId,
        branchId: row?.branchId ?? branchId,
        sg,
        mx,
        qm,
        recordId: row?.id ?? 0,
      })
    }

    setBatchSubmitting(true)
    let successCount = 0
    let failCount = 0
    try {
      // 串行执行避免并发冲突
      for (const item of parsed) {
        try {
          if (item.recordId > 0) {
            // 已有记录：更新
            await dataRecordsApi.update(item.recordId, {
              sg: item.sg,
              mx: item.mx,
              qm: item.qm,
            })
          } else {
            // 未录入：新建（按行匹配的 branchId）
            await dataRecordsApi.create({
              personnelId: item.personnelId,
              branchId: item.branchId,
              sg: item.sg,
              mx: item.mx,
              qm: item.qm,
            })
          }
          successCount++
        } catch {
          failCount++
        }
      }
      if (failCount === 0) {
        toast.success(`批量保存成功，共 ${successCount} 条`)
      } else {
        toast.error(`部分失败：成功 ${successCount} 条，失败 ${failCount} 条`)
      }
      setBatchEditOpen(false)
      setSelectedKeys(new Set())
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBatchSubmitting(false)
    }
  }

  // 批量添加：打开弹窗，仅列出勾选的行，输入框为空（累加值）
  const handleOpenBatchAdd = () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }
    if (selectedKeys.size === 0) {
      toast.error('请先勾选要批量添加的人员')
      return
    }
    const forms: Record<string, { sg: string; mx: string; qm: string }> = {}
    filteredRecords.forEach((r) => {
      const key = rowKey(r.branchId, r.personnelId)
      if (selectedKeys.has(key)) {
        // 输入框初始为空，输入的是要累加的数值
        forms[key] = { sg: '', mx: '', qm: '' }
      }
    })
    setBatchAddForms(forms)
    setBatchAddOpen(true)
  }

  // 批量添加：更新某行某字段
  const handleBatchAddFieldChange = (
    key: string,
    field: 'sg' | 'mx' | 'qm',
    value: string
  ) => {
    setBatchAddForms((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }))
  }

  // 批量添加提交：累加到已录入数据上（已录入则原值+输入值，未录入则新建为输入值）
  const handleBatchAddSubmit = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }
    const entries = Object.entries(batchAddForms)
    if (entries.length === 0) {
      toast.error('无数据可保存')
      return
    }
    // 解析并校验（key 格式为 `${branchId}:${personnelId}`）
    const parsed: Array<{
      personnelId: number
      branchId: number
      sg: number
      mx: number
      qm: number
      recordId: number
      // 累加后的最终值
      finalSg: number
      finalMx: number
      finalQm: number
    }> = []
    for (const [key, f] of entries) {
      const [bidStr, pidStr] = key.split(':')
      const branchId = Number(bidStr)
      const personnelId = Number(pidStr)
      // 空值视为 0（即不累加）；厅规则关闭收光/全麦转换时，对应字段强制为 0
      const addSg = !sgInputEnabled ? 0 : f.sg === '' ? 0 : Number(f.sg)
      const addMx = f.mx === '' ? 0 : Number(f.mx)
      const addQm = !qmInputEnabled ? 0 : f.qm === '' ? 0 : Number(f.qm)
      if (
        (sgInputEnabled && (!Number.isInteger(addSg) || addSg < 0)) ||
        !Number.isInteger(addMx) ||
        addMx < 0 ||
        (qmInputEnabled && (!Number.isInteger(addQm) || addQm < 0))
      ) {
        toast.error('收光/麦序/全麦必须为非负整数')
        return
      }
      const rec = records.find(
        (r) => r.personnelId === personnelId && r.branchId === branchId
      )
      // 累加：已有记录则原值+输入值，未录入则 0+输入值
      const finalSg = (rec?.sg ?? 0) + addSg
      const finalMx = (rec?.mx ?? 0) + addMx
      const finalQm = (rec?.qm ?? 0) + addQm
      // 跳过未录入且无输入的（避免创建全 0 的空记录）
      if (!rec && addSg === 0 && addMx === 0 && addQm === 0) continue
      parsed.push({
        personnelId,
        branchId: rec?.branchId ?? branchId,
        sg: addSg,
        mx: addMx,
        qm: addQm,
        recordId: rec?.id ?? 0,
        finalSg,
        finalMx,
        finalQm,
      })
    }

    if (parsed.length === 0) {
      toast.error('所有人员均未输入数据')
      return
    }

    setBatchAddSubmitting(true)
    let successCount = 0
    let failCount = 0
    try {
      for (const item of parsed) {
        try {
          if (item.recordId > 0) {
            // 已有记录：累加更新
            await dataRecordsApi.update(item.recordId, {
              sg: item.finalSg,
              mx: item.finalMx,
              qm: item.finalQm,
            })
          } else {
            // 未录入：新建为累加值（按行匹配的 branchId）
            await dataRecordsApi.create({
              personnelId: item.personnelId,
              branchId: item.branchId,
              sg: item.finalSg,
              mx: item.finalMx,
              qm: item.finalQm,
            })
          }
          successCount++
        } catch {
          failCount++
        }
      }
      if (failCount === 0) {
        toast.success(`批量添加成功，共 ${successCount} 条`)
      } else {
        toast.error(`部分失败：成功 ${successCount} 条，失败 ${failCount} 条`)
      }
      setBatchAddOpen(false)
      setSelectedKeys(new Set())
      await loadData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBatchAddSubmitting(false)
    }
  }

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
            {isMonthCycle ? getMonthRangeText(weekStart) : getWeekRangeText(weekStart)}
          </div>
          <button
            onClick={handleNextWeek}
            className="p-2 border border-border rounded-lg bg-card text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => {
              if (isMonthCycle) {
                // 月模式：回到本月1号
                const d = new Date()
                d.setDate(1)
                d.setHours(0, 0, 0, 0)
                setWeekStart(d)
              } else {
                setWeekStart(getWeekStart())
              }
            }}
            className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            {isMonthCycle ? '本月' : '本周'}
          </button>
          {/* 本周/本月切换 */}
          <div className="flex border border-border rounded-lg bg-card overflow-hidden">
            <button
              onClick={() => {
                setViewCycle('WEEK')
                setWeekStart(getWeekStart())
              }}
              className={`px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
                !isMonthCycle
                  ? 'bg-primary text-white font-medium'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              按周
            </button>
            <button
              onClick={() => {
                setViewCycle('MONTH')
                // 切换到本月1号（直接设置月初，避免 getWeekStart 导致月份错乱）
                const d = new Date()
                d.setDate(1)
                d.setHours(0, 0, 0, 0)
                setWeekStart(d)
              }}
              className={`px-3 py-2 text-sm transition-colors duration-200 cursor-pointer ${
                isMonthCycle
                  ? 'bg-primary text-white font-medium'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              按月
            </button>
          </div>
          {/* 厅配置统计周期标签 */}
          {effectiveBranchId && branchCycle === 'MONTH' && (
            <span
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              title="该厅配置为按月统计"
            >
              月统计厅
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
          {selectedKeys.size > 0 && (
            <button
              onClick={handleOpenBatchEdit}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <CheckSquare size={16} />
              批量编辑（{selectedKeys.size}）
            </button>
          )}
          {selectedKeys.size > 0 && (
            <button
              onClick={handleOpenBatchAdd}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <UserPlus size={16} />
              批量添加（{selectedKeys.size}）
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            disabled={!effectiveBranchId && !isHuizhang}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary hover:text-textPrimary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            <Upload size={16} />
            导入
          </button>
          {canDelete && (
            <button
              onClick={handleOpenExport}
              disabled={!effectiveBranchId}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              title={!effectiveBranchId ? '请先选择厅' : undefined}
            >
              <Download size={16} />
              导出
            </button>
          )}
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
            <label className="block text-xs text-textSecondary mb-1">
              收光
              {!sgInputEnabled && (
                <span className="ml-1 text-[10px] text-textMuted">（已关闭）</span>
              )}
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={sgInputEnabled ? form.sg : ''}
              onChange={(e) => setForm({ ...form, sg: e.target.value })}
              placeholder={sgInputEnabled ? '0' : '已关闭'}
              disabled={!sgInputEnabled}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <label className="block text-xs text-textSecondary mb-1">
              全麦
              {!qmInputEnabled && (
                <span className="ml-1 text-[10px] text-textMuted">（已关闭）</span>
              )}
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={qmInputEnabled ? form.qm : ''}
              onChange={(e) => setForm({ ...form, qm: e.target.value })}
              placeholder={qmInputEnabled ? '0' : '已关闭'}
              disabled={!qmInputEnabled}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !effectiveBranchId}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              title={!effectiveBranchId ? '请先选择厅' : undefined}
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

      {/* 录入明细：weekStart/effectiveBranchId 变化时重新触发入场动画 */}
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
                  <th className="px-3 py-3 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredRecords.length > 0 &&
                        filteredRecords.every((r) =>
                          selectedKeys.has(rowKey(r.branchId, r.personnelId))
                        )
                      }
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 cursor-pointer accent-primary"
                      title="全选/取消全选"
                    />
                  </th>
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
                      colSpan={9}
                      className="px-4 py-12 text-center text-textMuted"
                    >
                      {!effectiveBranchId
                        ? '请选择厅后查看数据'
                        : form.personnelId
                        ? '该人员本周暂无数据'
                        : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr
                      key={r.key}
                      className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                        !r.isRecorded ? 'opacity-60' : ''
                      } ${selectedKeys.has(rowKey(r.branchId, r.personnelId)) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(rowKey(r.branchId, r.personnelId))}
                          onChange={() => handleToggleSelect(r.branchId, r.personnelId)}
                          className="w-4 h-4 cursor-pointer accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3 text-textPrimary">
                        <div className="flex items-center gap-2">
                          {r.personnelName}
                          {!r.isRecorded && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-textMuted/10 text-textMuted">
                              未录入
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        {r.branchName || '-'}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {r.isRecorded ? r.sg : '-'}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {r.isRecorded ? r.mx : '-'}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {r.isRecorded ? r.qm : '-'}
                      </td>
                      <td className="px-4 py-3 text-textPrimary font-mono">
                        {r.welfare ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-textMuted text-xs">
                        {r.createdAt ? formatDateTime(r.createdAt) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.isRecorded ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit({
                                id: r.id,
                                personnelId: r.personnelId,
                                sg: r.sg,
                                mx: r.mx,
                                qm: r.qm,
                              } as DataRecord)}
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
                        ) : (
                          <span className="text-textMuted text-xs">-</span>
                        )}
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
              <label className="block text-xs text-textSecondary mb-1">
                收光
                {!sgInputEnabled && (
                  <span className="ml-1 text-[10px] text-textMuted">（已关闭）</span>
                )}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={sgInputEnabled ? editForm.sg : ''}
                onChange={(e) => setEditForm({ ...editForm, sg: e.target.value })}
                placeholder={sgInputEnabled ? '0' : '已关闭'}
                disabled={!sgInputEnabled}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <label className="block text-xs text-textSecondary mb-1">
                全麦
                {!qmInputEnabled && (
                  <span className="ml-1 text-[10px] text-textMuted">（已关闭）</span>
                )}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={qmInputEnabled ? editForm.qm : ''}
                onChange={(e) => setEditForm({ ...editForm, qm: e.target.value })}
                placeholder={qmInputEnabled ? '0' : '已关闭'}
                disabled={!qmInputEnabled}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* 批量编辑弹窗：每行独立编辑（按厅区分同一人员） */}
      <Modal
        open={batchEditOpen}
        title={`批量编辑（${selectedKeys.size} 项）`}
        onClose={() => setBatchEditOpen(false)}
        footer={
          <>
            <button
              onClick={() => setBatchEditOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleBatchSubmit}
              disabled={batchSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {batchSubmitting ? <Spinner className="h-4 w-4" /> : <Save size={16} />}
              {batchSubmitting ? '保存中...' : '批量保存'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-textMuted">
            每行可独立编辑收光/麦序/全麦，未录入的行填写后将自动创建记录。同一人员在多个厅的数据互不影响。
          </p>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin space-y-2">
            {filteredRecords
              .filter((r) => selectedKeys.has(rowKey(r.branchId, r.personnelId)))
              .map((r) => {
                const k = rowKey(r.branchId, r.personnelId)
                return (
                <div
                  key={k}
                  className={`p-3 border rounded-lg ${
                    r.isRecorded
                      ? 'border-border bg-card'
                      : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-textPrimary">
                        {r.personnelName}
                      </span>
                      {!r.isRecorded && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          未录入
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-textMuted">
                      {r.branchName || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-textSecondary mb-0.5">
                        收光
                        {!sgInputEnabled && (
                          <span className="text-textMuted">（已关闭）</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={sgInputEnabled ? batchForms[k]?.sg ?? '' : ''}
                        onChange={(e) =>
                          handleBatchFieldChange(k, 'sg', e.target.value)
                        }
                        placeholder={sgInputEnabled ? '0' : '已关闭'}
                        disabled={!sgInputEnabled}
                        className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary mb-0.5">
                        麦序
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={batchForms[k]?.mx ?? ''}
                        onChange={(e) =>
                          handleBatchFieldChange(k, 'mx', e.target.value)
                        }
                        placeholder="0"
                        className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-textSecondary mb-0.5">
                        全麦
                        {!qmInputEnabled && (
                          <span className="text-textMuted">（已关闭）</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={qmInputEnabled ? batchForms[k]?.qm ?? '' : ''}
                        onChange={(e) =>
                          handleBatchFieldChange(k, 'qm', e.target.value)
                        }
                        placeholder={qmInputEnabled ? '0' : '已关闭'}
                        disabled={!qmInputEnabled}
                        className="w-full px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
                )
              })}
          </div>
        </div>
      </Modal>

      {/* 批量添加弹窗：表格化累加录入勾选行数据（按厅区分同一人员） */}
      <Modal
        open={batchAddOpen}
        title={`批量添加（${selectedKeys.size} 项）`}
        onClose={() => setBatchAddOpen(false)}
        footer={
          <>
            <button
              onClick={() => setBatchAddOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleBatchAddSubmit}
              disabled={batchAddSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {batchAddSubmitting ? <Spinner className="h-4 w-4" /> : <Save size={16} />}
              {batchAddSubmitting ? '保存中...' : '批量累加'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-textMuted">
            输入的数值会累加到已录入的数据上（原值 + 输入值）。未录入的行将以此数值创建新记录。留空视为 0（不累加）。同一人员在多个厅的数据互不影响。
          </p>
          <div className="max-h-[60vh] overflow-auto scrollbar-thin border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border sticky top-0 z-10">
                <tr className="text-left text-textSecondary">
                  <th className="px-3 py-2 font-medium">人员</th>
                  <th className="px-3 py-2 font-medium">厅</th>
                  <th className="px-3 py-2 font-medium text-center">收光</th>
                  <th className="px-3 py-2 font-medium text-center">麦序</th>
                  <th className="px-3 py-2 font-medium text-center">全麦</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords
                  .filter((r) => selectedKeys.has(rowKey(r.branchId, r.personnelId)))
                  .map((r) => {
                    const k = rowKey(r.branchId, r.personnelId)
                    return (
                    <tr
                      key={k}
                      className={`border-b border-border last:border-0 ${
                        !r.isRecorded ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-textPrimary align-middle">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.personnelName}</span>
                          {!r.isRecorded ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              未录入
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              已录入
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-textSecondary text-xs align-middle">
                        {r.branchName || '-'}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={sgInputEnabled ? batchAddForms[k]?.sg ?? '' : ''}
                          onChange={(e) =>
                            handleBatchAddFieldChange(k, 'sg', e.target.value)
                          }
                          placeholder={sgInputEnabled ? '0' : '已关闭'}
                          disabled={!sgInputEnabled}
                          className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={batchAddForms[k]?.mx ?? ''}
                          onChange={(e) =>
                            handleBatchAddFieldChange(k, 'mx', e.target.value)
                          }
                          placeholder="0"
                          className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={qmInputEnabled ? batchAddForms[k]?.qm ?? '' : ''}
                          onChange={(e) =>
                            handleBatchAddFieldChange(k, 'qm', e.target.value)
                          }
                          placeholder={qmInputEnabled ? '0' : '已关闭'}
                          disabled={!qmInputEnabled}
                          className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-card text-textPrimary font-mono text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* 导出弹窗：可选按周/按月 + 历史周/月 */}
      <Modal
        open={exportOpen}
        title="导出数据"
        onClose={() => setExportOpen(false)}
        footer={
          <>
            <button
              onClick={() => setExportOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {exporting === 'excel' ? <Spinner className="h-4 w-4" /> : <Download size={16} />}
              {exporting === 'excel' ? '导出中...' : '导出 Excel'}
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {exporting === 'csv' ? <Spinner className="h-4 w-4" /> : <Download size={16} />}
              {exporting === 'csv' ? '导出中...' : '导出 CSV'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 周期切换 */}
          <div>
            <label className="block text-xs text-textSecondary mb-2">导出周期</label>
            <div className="flex border border-border rounded-lg bg-card overflow-hidden w-fit">
              <button
                onClick={() => handleExportCycleChange('WEEK')}
                className={`px-4 py-2 text-sm transition-colors duration-200 cursor-pointer ${
                  exportCycle === 'WEEK'
                    ? 'bg-primary text-white font-medium'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                按周
              </button>
              <button
                onClick={() => handleExportCycleChange('MONTH')}
                className={`px-4 py-2 text-sm transition-colors duration-200 cursor-pointer ${
                  exportCycle === 'MONTH'
                    ? 'bg-primary text-white font-medium'
                    : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                按月
              </button>
            </div>
          </div>

          {/* 日期选择 */}
          <div>
            <label className="block text-xs text-textSecondary mb-2">
              {exportCycle === 'MONTH' ? '选择月份' : '选择周次'}
            </label>
            {exportCycle === 'MONTH' ? (
              <select
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                {exportMonths.map((m) => (
                  <option key={m.key} value={m.ref}>
                    {getMonthRangeText(m.ref)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                {exportWeeks.map((w) => (
                  <option key={w} value={w}>
                    {getWeekRangeText(w)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-textMuted">
            导出当前所选厅在该周期内的排名与福利数据。会长未选择厅时无法导出。
          </p>
        </div>
      </Modal>
    </div>
  )
}
