import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  Trash2,
  Plus,
  Info,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from 'lucide-react'
import {
  violationRecordsApi,
  violationItemsApi,
  personnelApi,
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
import SubPageHeader from '../components/SubPageHeader'
import type {
  ViolationItem,
  ViolationRecord,
  Personnel,
  BranchGroup,
} from '../types'

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

// 编辑表单结构
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

// 人员违规聚合行
interface PersonnelViolationRow {
  key: string
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  count: number
  totalDeduction: number
  lastDate: string
  records: ViolationRecord[]
  // 按违规项目分组
  itemsByCount: { itemId: number; itemName: string; count: number; deduction: number }[]
}

export default function Violations() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canEdit = isHuizhang || isChaoguan

  const [branches, setBranches] = useState<
    { id: number; name: string; statCycle: 'WEEK' | 'MONTH'; closed: boolean }[]
  >([])
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined)
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [records, setRecords] = useState<ViolationRecord[]>([])
  const [violationItems, setViolationItems] = useState<ViolationItem[]>([])
  // 按厅存储违规项目（合厅组模式下用于按人员所属厅匹配正确的 violationItemId）
  const [violationItemsByBranch, setViolationItemsByBranch] = useState<Map<number, ViolationItem[]>>(new Map())

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStart())
  const [availableMonths, setAvailableMonths] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)

  // 多选：选中行标识
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // 编辑单条记录模态框
  const [editOpen, setEditOpen] = useState(false)
  const [editingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyForm)
  const [editSaving, setEditSaving] = useState(false)

  // 批量添加违规模态框（操作逻辑与数据录入页添加一致）
  const [batchAddOpen, setBatchAddOpen] = useState(false)
  // 共用字段：违规项目、违规日期（顶部输入，覆盖所有选中人员）
  const [batchItemId, setBatchItemId] = useState<string>('')
  const [batchDate, setBatchDate] = useState<string>(formatDate(new Date()))
  const [batchAddSubmitting, setBatchAddSubmitting] = useState(false)

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

  const groupedBranchIds = useMemo(() => {
    const s = new Set<number>()
    for (const g of branchGroups) {
      for (const b of g.branches) s.add(b.id)
    }
    return s
  }, [branchGroups])

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

  // 加载人员
  const loadPersonnel = async () => {
    if (queryBranchIds.length === 0) {
      setPersonnel([])
      return
    }
    try {
      const lists = await Promise.all(
        queryBranchIds.map((bid) => personnelApi.list(bid)),
      )
      const seen = new Set<number>()
      const merged: Personnel[] = []
      for (const list of lists) {
        for (const p of list) {
          if (seen.has(p.id)) continue
          seen.add(p.id)
          merged.push(p)
        }
      }
      setPersonnel(merged)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setPersonnel([])
    }
  }

  // 加载违规记录
  const loadRecords = async () => {
    if (queryBranchIds.length === 0) {
      setRecords([])
      return
    }
    try {
      const lists = await Promise.all(
        queryBranchIds.map((bid) =>
          violationRecordsApi.list({ branchId: bid, periodStart: selectedMonth }),
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

  // 加载违规项目配置
  const loadViolationItems = async () => {
    if (queryBranchIds.length === 0) {
      setViolationItems([])
      setViolationItemsByBranch(new Map())
      return
    }
    try {
      const lists = await Promise.all(
        queryBranchIds.map((bid) => violationItemsApi.list(bid)),
      )
      // 保存按厅的映射（用于合厅组模式下按人员所属厅匹配正确的 violationItemId）
      const byBranch = new Map<number, ViolationItem[]>()
      for (let i = 0; i < queryBranchIds.length; i++) {
        byBranch.set(queryBranchIds[i], lists[i] ?? [])
      }
      setViolationItemsByBranch(byBranch)
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
      setViolationItemsByBranch(new Map())
    }
  }

  // 加载月份列表
  const loadMonths = async () => {
    if (queryBranchIds.length === 0) {
      setAvailableMonths([currentMonthStart()])
      return
    }
    try {
      const monthsLists = await Promise.all(
        queryBranchIds.map((bid) => violationRecordsApi.listMonths(bid)),
      )
      const all = monthsLists.flat().map((m) => normalizeMonthStart(m))
      const unique = Array.from(new Set(all)).sort((a, b) => b.localeCompare(a))
      const cur = currentMonthStart()
      if (!unique.includes(cur)) unique.unshift(cur)
      setAvailableMonths(unique)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setAvailableMonths([currentMonthStart()])
    }
  }

  const reloadAll = async () => {
    setLoading(true)
    await Promise.all([loadPersonnel(), loadRecords(), loadViolationItems(), loadMonths()])
    setLoading(false)
  }

  useEffect(() => {
    if (queryBranchIds.length > 0) {
      reloadAll()
    } else {
      setPersonnel([])
      setRecords([])
      setViolationItems([])
      setViolationItemsByBranch(new Map())
      setAvailableMonths([currentMonthStart()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryBranchIds, selectedMonth])

  // 切换厅/月/搜索时重置分页、选中
  useEffect(() => {
    setPage(1)
    setSelectedKeys(new Set())
  }, [searchTerm, queryBranchIds, selectedMonth])

  // 厅名映射
  const branchNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of branches) m.set(b.id, b.name)
    if (selectedGroup) {
      for (const b of selectedGroup.branches) m.set(b.id, b.name)
    }
    return m
  }, [branches, selectedGroup])

  // 人员名映射
  const personnelNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of personnel) m.set(p.id, p.name)
    for (const r of records) {
      if (r.personnel?.name && !m.has(r.personnelId)) {
        m.set(r.personnelId, r.personnel.name)
      }
    }
    return m
  }, [personnel, records])

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

  // ============ 按人员聚合违规记录 ============
  // 先从 records 聚合有违规记录的人员，再从 personnel 列表补充无违规记录的人员（空行）
  const personnelRows = useMemo<PersonnelViolationRow[]>(() => {
    const map = new Map<string, PersonnelViolationRow>()
    // 1. 从违规记录聚合
    for (const r of records) {
      const key = `${r.branchId}:${r.personnelId}`
      const pItem = itemMap.get(r.violationItemId)
      const deduction = pItem?.deductionAmount ?? r.item?.deductionAmount ?? 0
      const pName = r.personnel?.name ?? personnelNameMap.get(r.personnelId) ?? `人员${r.personnelId}`
      const bName = r.branch?.name ?? branchNameMap.get(r.branchId) ?? '-'
      const itemName = pItem?.name ?? r.item?.name ?? `项目${r.violationItemId}`

      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        existing.totalDeduction += Number(deduction) || 0
        if (r.violationDate > existing.lastDate) existing.lastDate = r.violationDate
        existing.records.push(r)
        const itemEntry = existing.itemsByCount.find((it) => it.itemId === r.violationItemId)
        if (itemEntry) {
          itemEntry.count += 1
          itemEntry.deduction += Number(deduction) || 0
        } else {
          existing.itemsByCount.push({ itemId: r.violationItemId, itemName, count: 1, deduction: Number(deduction) || 0 })
        }
      } else {
        map.set(key, {
          key,
          personnelId: r.personnelId,
          personnelName: pName,
          branchId: r.branchId,
          branchName: bName,
          count: 1,
          totalDeduction: Number(deduction) || 0,
          lastDate: r.violationDate,
          records: [r],
          itemsByCount: [{ itemId: r.violationItemId, itemName, count: 1, deduction: Number(deduction) || 0 }],
        })
      }
    }
    // 2. 从 personnel 列表补充无违规记录的人员（空行）
    const memberSet = new Set(queryBranchIds)
    for (const p of personnel) {
      const matchedBranches = p.branches?.filter((b) => memberSet.has(b.id)) ?? []
      for (const b of matchedBranches) {
        const key = `${b.id}:${p.id}`
        if (!map.has(key)) {
          map.set(key, {
            key,
            personnelId: p.id,
            personnelName: p.name,
            branchId: b.id,
            branchName: b.name,
            count: 0,
            totalDeduction: 0,
            lastDate: '',
            records: [],
            itemsByCount: [],
          })
        }
      }
    }
    // 3. 排序：有违规记录的在前（按次数降序、最近日期降序），无记录的在后（按姓名排序）
    return Array.from(map.values()).sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1
      if (a.count === 0 && b.count > 0) return 1
      if (b.count !== a.count) return b.count - a.count
      if (a.count > 0) return b.lastDate.localeCompare(a.lastDate)
      return a.personnelName.localeCompare(b.personnelName)
    })
  }, [records, itemMap, personnelNameMap, branchNameMap, personnel, queryBranchIds])

  // 搜索过滤
  const filteredRows = useMemo(() => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return personnelRows
    return personnelRows.filter((row) => matchNamePinyin(row.personnelName, trimmed))
  }, [personnelRows, searchTerm])

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, safePage])

  // 汇总
  const summary = useMemo(() => {
    let totalCount = 0
    let totalDeduction = 0
    const personnelSet = new Set<number>()
    for (const r of records) {
      totalCount += 1
      const item = itemMap.get(r.violationItemId)
      const deduction = item?.deductionAmount ?? r.item?.deductionAmount ?? 0
      totalDeduction += Number(deduction) || 0
      personnelSet.add(r.personnelId)
    }
    return {
      totalCount,
      totalDeduction: Math.round(totalDeduction * 100) / 100,
      personnelCount: personnelSet.size,
    }
  }, [records, itemMap])

  // 当前编辑单条的违规项目详情
  const editEditingItem = useMemo(() => {
    if (!editForm.violationItemId) return undefined
    return itemMap.get(Number(editForm.violationItemId))
  }, [editForm.violationItemId, itemMap])

  // 批量添加共用的违规项目详情
  const batchEditingItem = useMemo(() => {
    if (!batchItemId) return undefined
    return itemMap.get(Number(batchItemId))
  }, [batchItemId, itemMap])

  // 当前所选月份的最后一天
  const monthEndDate = useMemo(() => {
    const d = new Date(selectedMonth + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return undefined
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const y = end.getFullYear()
    const m = String(end.getMonth() + 1).padStart(2, '0')
    const day = String(end.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [selectedMonth])

  // ============ 多选 ============
  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedKeys((prev) => {
      const allSelected = pagedRows.length > 0 && pagedRows.every((r) => prev.has(r.key))
      if (allSelected) {
        // 取消当前页全选
        const next = new Set(prev)
        for (const r of pagedRows) next.delete(r.key)
        return next
      } else {
        // 选中当前页全部
        const next = new Set(prev)
        for (const r of pagedRows) next.add(r.key)
        return next
      }
    })
  }

  // 批量删除选中人员的所有违规记录
  const handleBatchDelete = async () => {
    if (selectedKeys.size === 0) {
      toast.error('请先勾选要删除的人员')
      return
    }
    // 收集所有选中人员的违规记录 ID
    const idsToDelete: number[] = []
    for (const row of personnelRows) {
      if (selectedKeys.has(row.key)) {
        for (const r of row.records) idsToDelete.push(r.id)
      }
    }
    if (idsToDelete.length === 0) {
      toast.error('选中人员无违规记录')
      return
    }
    if (!window.confirm(`确认删除选中的 ${selectedKeys.size} 人员的 ${idsToDelete.length} 条违规记录？`)) return
    try {
      // 串行删除
      for (const id of idsToDelete) {
        await violationRecordsApi.delete(id)
      }
      toast.success(`已删除 ${idsToDelete.length} 条违规记录`)
      setSelectedKeys(new Set())
      await Promise.all([loadRecords(), loadMonths()])
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // ============ 批量添加违规记录（操作逻辑与数据录入页添加一致） ============
  // 打开批量添加模态框：仅选中人员时可用，自动带入所有选中人员
  const openBatchAdd = () => {
    if (violationItems.length === 0) {
      toast.error('当前厅暂无违规项目配置，请先在厅管理中添加')
      return
    }
    if (selectedKeys.size === 0) {
      toast.error('请先在人员列表中勾选要添加违规的人员')
      return
    }
    // 初始化共用字段
    setBatchItemId('')
    setBatchDate(formatDate(new Date()))
    setBatchAddOpen(true)
  }

  // 批量添加提交：串行创建，统计成功/失败
  const handleBatchAddSubmit = async () => {
    if (!hasBranchSelected) return
    if (!batchItemId) {
      toast.error('请选择违规项目')
      return
    }
    if (!batchDate) {
      toast.error('请选择违规日期')
      return
    }
    const dateMonth = normalizeMonthStart(batchDate)
    if (dateMonth !== selectedMonth) {
      toast.error(`违规日期须在 ${formatMonthCN(selectedMonth.slice(0, 7))} 内`)
      return
    }

    // 收集选中人员（按 personnelRows 顺序）
    const targets: PersonnelViolationRow[] = []
    for (const row of personnelRows) {
      if (selectedKeys.has(row.key)) {
        targets.push(row)
      }
    }
    if (targets.length === 0) {
      toast.error('无选中人员')
      return
    }

    setBatchAddSubmitting(true)
    let successCount = 0
    let failCount = 0
    try {
      // 合厅组模式下：找到选中违规项目的名称，用于按厅匹配同名的 violationItemId
      const selectedItem = violationItems.find((it) => String(it.id) === batchItemId)
      const selectedItemName = selectedItem?.name
      for (const row of targets) {
        // 直接用 row.branchId（该行所属的厅），避免误用人员的其他厅
        const targetBranchId = row.branchId
        if (!targetBranchId) {
          failCount++
          continue
        }
        // 合厅组模式下：按 row.branchId 找到该厅的同名违规项目 id
        let targetItemId = Number(batchItemId)
        if (isGroupMode && selectedItemName) {
          const branchItems = violationItemsByBranch.get(targetBranchId) ?? []
          const matched = branchItems.find((it) => it.name === selectedItemName)
          if (!matched) {
            failCount++
            continue
          }
          targetItemId = matched.id
        }
        try {
          await violationRecordsApi.create({
            branchId: targetBranchId,
            personnelId: row.personnelId,
            violationItemId: targetItemId,
            violationDate: batchDate,
            periodStart: selectedMonth,
            remark: undefined,
          })
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
      await Promise.all([loadRecords(), loadMonths()])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBatchAddSubmitting(false)
    }
  }

  // ============ 编辑单条违规记录 ============
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
    const dateMonth = normalizeMonthStart(editForm.violationDate)
    if (dateMonth !== selectedMonth) {
      toast.error(`违规日期须在 ${formatMonthCN(selectedMonth.slice(0, 7))} 内`)
      return
    }

    setEditSaving(true)
    try {
      await violationRecordsApi.update(editingId!, {
        violationItemId: Number(editForm.violationItemId),
        violationDate: editForm.violationDate,
        periodStart: selectedMonth,
        remark: editForm.remark.trim() || undefined,
      })
      toast.success('违规记录已更新')
      setEditOpen(false)
      await Promise.all([loadRecords(), loadMonths()])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setEditSaving(false)
    }
  }

  const branchName = isGroupMode
    ? (selectedGroup?.name ?? '合厅组')
    : (branches.find((b) => b.id === effectiveBranchId)?.name ?? '全部授权厅')

  // 违规项目选项
  const itemOptions = useMemo(() => {
    return violationItems.map((it) => ({
      value: String(it.id),
      label: it.name,
    }))
  }, [violationItems])

  // 表格列数：(勾选框) + 人员 + (所属厅) + 次数
  const columnCount = 2 + (isGroupMode ? 1 : 0) + (canEdit ? 1 : 0)

  // 当前页是否全选
  const allSelected = pagedRows.length > 0 && pagedRows.every((r) => selectedKeys.has(r.key))

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="违规标记"
        desc="按月录入人员违规记录，达到阈值清空福利"
      >
        <button
          onClick={() => navigate('/violations/details')}
          className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textPrimary rounded-custom-sm text-sm hover:border-primary hover:text-primary transition-colors duration-200 cursor-pointer"
          title="查看所有违规记录明细"
        >
          <BarChart3 size={16} />
          违规明细
        </button>
      </SubPageHeader>

      {/* 厅/合厅组选择 + 月份选择 + 刷新 */}
      <div className="flex items-center gap-2 flex-wrap">
        <GroupedSelect
          value={
            isGroupMode
              ? `g${selectedGroupId}`
              : (branchId !== undefined ? String(branchId) : '')
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
          topOption={
            isHuizhang ? { value: '', label: '选择厅' } : undefined
          }
          groups={[
            ...(branchGroups.length > 0
              ? [{
                  label: '合厅组',
                  options: branchGroups.map((g) => ({
                    value: `g${g.id}`,
                    label: `${g.name}（${g.branches.filter((b) => !b.closed).length}个厅）`,
                  })),
                }]
              : []),
            {
              label: '厅',
              options: branches
                .filter(
                  (b) =>
                    !b.closed &&
                    !groupedBranchIds.has(b.id),
                )
                .map((b) => ({
                  value: String(b.id),
                  label: `${b.name}${b.statCycle === 'MONTH' ? '（按月）' : ''}`,
                })),
            },
          ]}
          minWidth={180}
          maxWidth={280}
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
      </div>

      {/* 未选厅时提示 */}
      {!hasBranchSelected ? (
        <div className="art-card px-5 py-16 text-center text-sm text-textMuted">
          请先选择厅
        </div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">违规次数</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary.totalCount}
              </div>
            </div>
            <div className="art-card px-4 py-3">
              <div className="text-xs text-textSecondary mb-1">涉及人员</div>
              <div className="text-2xl font-bold text-textPrimary">
                {summary.personnelCount}
              </div>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-custom-sm bg-primary/5 border border-primary/20 text-xs text-textSecondary">
            <Info size={14} className="text-primary shrink-0" />
            <span>
              {isGroupMode ? '合厅组' : '当前厅'}「{branchName}」 ｜ 周期：{formatMonthCN(selectedMonth.slice(0, 7))}
              {violationItems.length === 0 && (
                <span className="ml-1 text-amber-600">
                  （当前未配置违规项目，请在厅管理中添加）
                </span>
              )}
            </span>
          </div>

          {/* 工具栏：搜索 + 批量删除 + 添加 */}
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
                placeholder="搜索人员姓名（支持中文首字母）"
                aria-label="搜索人员"
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
            {/* 选中人数提示 */}
            {selectedKeys.size > 0 && (
              <span className="text-xs text-textSecondary">
                共 {filteredRows.length} 人，已选 {selectedKeys.size} 人
              </span>
            )}
            {canEdit && selectedKeys.size > 0 && (
              <>
                <button
                  onClick={openBatchAdd}
                  disabled={violationItems.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  title={violationItems.length === 0 ? '请先在厅管理中添加违规项目' : undefined}
                >
                  <Plus size={16} />
                  添加违规（{selectedKeys.size}人）
                </button>
                <button
                  onClick={handleBatchDelete}
                  className="flex items-center gap-1.5 px-3 py-2 border border-danger/40 text-danger rounded-custom-sm text-sm font-medium hover:bg-danger/10 transition-colors duration-200 cursor-pointer"
                >
                  <Trash2 size={16} />
                  批量删除（{selectedKeys.size}人）
                </button>
              </>
            )}
          </div>

          {/* 人员违规表格 */}
          <div className="art-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    {canEdit && (
                      <th className="px-3 py-3 font-medium w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="checkbox-round cursor-pointer"
                          title="全选/取消全选（当前页）"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 font-medium">人员</th>
                    {isGroupMode && (
                      <th className="px-4 py-3 font-medium">所属厅</th>
                    )}
                    <th className="px-4 py-3 font-medium text-center">次数</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {Array.from({ length: columnCount }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={columnCount} className="px-4 py-16 text-center text-textMuted">
                        <div className="flex flex-col items-center gap-2">
                          <AlertTriangle size={32} className="opacity-40" />
                          <span className="text-sm">
                            {searchTerm
                              ? '未找到匹配的人员'
                              : personnel.length === 0
                                ? '当前厅暂无人员'
                                : '暂无数据'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row) => {
                      const isSelected = selectedKeys.has(row.key)
                      return (
                        <tr
                          key={row.key}
                          className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${isSelected ? 'bg-primary/5' : ''} ${row.count === 0 ? 'opacity-60' : ''}`}
                        >
                          {canEdit && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(row.key)}
                                className="checkbox-round cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3 text-textPrimary font-medium">
                            {row.personnelName}
                          </td>
                          {isGroupMode && (
                            <td className="px-4 py-3 text-textSecondary text-xs">
                              {row.branchName}
                            </td>
                          )}
                          <td className="px-4 py-3 text-center text-textPrimary font-mono font-semibold">
                            {row.count}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页控件 */}
          {filteredRows.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-textMuted">
                共 {filteredRows.length} 人，第 {safePage}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 py-1 text-sm text-textPrimary font-mono">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 批量添加违规 Modal（操作逻辑与数据录入页添加一致） */}
      <Modal
        open={batchAddOpen}
        title={`添加违规（${selectedKeys.size} 人）`}
        onClose={() => setBatchAddOpen(false)}
        width="max-w-xl"
        footer={
          <>
            <span className="mr-auto text-xs text-textMuted">
              共 {selectedKeys.size} 人
            </span>
            <button
              onClick={() => setBatchAddOpen(false)}
              disabled={batchAddSubmitting}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleBatchAddSubmit}
              disabled={batchAddSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {batchAddSubmitting && <Spinner className="h-4 w-4" />}
              {batchAddSubmitting ? '保存中...' : '批量添加'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-textMuted">
            选择违规项目和日期后，系统将为以下选中人员逐条创建违规记录。
          </p>

          {/* 顶部共用字段：违规项目 + 违规日期 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                违规项目 <span className="text-danger">*</span>
              </label>
              <GroupedSelect
                value={batchItemId}
                onChange={(val) => setBatchItemId(val)}
                placeholder="选择违规项目"
                fullWidth
                options={itemOptions}
              />
              {batchItemId && batchEditingItem && batchEditingItem.thresholdCount > 0 && (
                <p className="text-xs text-textMuted mt-1.5 leading-relaxed">
                  达到
                  <span className="font-mono text-danger font-semibold">
                    {' '}{batchEditingItem.thresholdCount}{' '}
                  </span>
                  次将清空该周期福利
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                违规日期 <span className="text-danger">*</span>
              </label>
              <DatePicker
                value={batchDate}
                onChange={setBatchDate}
                fullWidth
                showYear
                minDate={selectedMonth}
                maxDate={monthEndDate}
              />
              <p className="text-xs text-textMuted mt-1">
                仅可选择当前周期内的日期
              </p>
            </div>
          </div>

          {/* 选中人员列表（只读展示） */}
          <div className="max-h-[40vh] overflow-auto scrollbar-thin border border-border rounded-custom-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border sticky top-0 z-10">
                <tr className="text-left text-textSecondary">
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                    选中人员
                  </th>
                  {isGroupMode && (
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                      所属厅
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {personnelRows
                  .filter((row) => selectedKeys.has(row.key))
                  .map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-150"
                    >
                      <td className="px-4 py-2 text-textPrimary font-medium whitespace-nowrap">
                        {row.personnelName}
                      </td>
                      {isGroupMode && (
                        <td className="px-3 py-2 text-textSecondary text-xs whitespace-nowrap">
                          {row.branchName}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

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
              {isGroupMode ? `合厅组：${branchName}` : `厅：${branchName}`} ｜ 周期：{formatMonthCN(selectedMonth.slice(0, 7))}
            </span>
          </div>

          {/* 人员（只读） */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              人员
            </label>
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
            {editEditingItem && editEditingItem.thresholdCount > 0 && (
              <p className="text-xs text-textMuted mt-1.5 leading-relaxed">
                达到
                <span className="font-mono text-danger font-semibold">
                  {' '}{editEditingItem.thresholdCount}{' '}
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
              minDate={selectedMonth}
              maxDate={monthEndDate}
            />
            <p className="text-xs text-textMuted mt-1">
              仅可选择当前周期内的日期
            </p>
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
