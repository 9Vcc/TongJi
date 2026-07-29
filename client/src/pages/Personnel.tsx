import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  Plus,
  Trash2,
  UserX,
  Upload,
  Search,
  X,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Download,
  Star,
  CheckSquare,
} from 'lucide-react'
import {
  personnelApi,
  branchesApi,
  exportApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { matchNamePinyin, formatDate } from '../utils'
import Modal from '../components/Modal'
import { Skeleton, Spinner } from '../components/Skeleton'
import GroupedSelect from '../components/GroupedSelect'
import type { Personnel as PersonnelType, Branch } from '../types'

type AddTab = 'single' | 'batch'
// 主持标记编辑模式：keep=不修改，on=标记为主持，off=取消主持
type HostMode = 'keep' | 'on' | 'off'

const PAGE_SIZE = 20

export default function Personnel() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canSelectBranch = isHuizhang || isChaoguan
  const canDelete = isHuizhang || isChaoguan
  const canAdd = isHuizhang || isChaoguan
  const canEdit = isHuizhang || isChaoguan

  const [personnel, setPersonnel] = useState<PersonnelType[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // 搜索框
  const [searchTerm, setSearchTerm] = useState('')
  // 分页
  const [page, setPage] = useState(1)

  const [addOpen, setAddOpen] = useState(false)
  // 单个添加
  const [name, setName] = useState('')
  // 批量导入
  const [addTab, setAddTab] = useState<AddTab>('single')
  const [batchText, setBatchText] = useState('')
  // 公共
  const [addBranchId, setAddBranchId] = useState<number | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  // 多选（仅 canEdit/canDelete 可操作）
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // 编辑信息弹窗（单人改名 + 主持标记；多人批量主持标记）
  const [editOpen, setEditOpen] = useState(false)
  // 编辑目标：单人时为 [personnel]，多人时为完整列表
  const [editTargets, setEditTargets] = useState<PersonnelType[]>([])
  const [editName, setEditName] = useState('')
  // 单人：显示当前主持状态作为 toggle 初始值；多人：3态
  const [editHostMode, setEditHostMode] = useState<HostMode>('keep')
  const [editing, setEditing] = useState(false)

  // 删除确认弹窗（需输入密码）
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PersonnelType | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  // 导出人员名单
  const [exporting, setExporting] = useState<'excel' | 'csv' | null>(null)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)

  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    if (isChaoguan) return branchId ?? user?.branchId ?? undefined
    return user?.branchId ?? undefined
  }, [isHuizhang, isChaoguan, branchId, user])

  const loadPersonnel = async () => {
    setLoading(true)
    try {
      const list = await personnelApi.list(effectiveBranchId)
      setPersonnel(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 所有角色都加载厅列表（用于判断 statCycle 和厅选择器）
    branchesApi.list().then(setBranches).catch(() => {})
  }, [])

  // 仅在选了厅时加载人员（会长需选厅；超管/管理有默认 branchId）
  useEffect(() => {
    if (effectiveBranchId !== undefined) {
      loadPersonnel()
    } else {
      setPersonnel([])
    }
    // 切厅时清空多选
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId])

  // 搜索过滤（支持中文首字母）
  const filteredPersonnel = useMemo(() => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return personnel
    return personnel.filter((p) => matchNamePinyin(p.name, trimmed))
  }, [personnel, searchTerm])

  // 搜索或切厅时重置到第1页
  useEffect(() => {
    setPage(1)
  }, [searchTerm, effectiveBranchId])

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(filteredPersonnel.length / PAGE_SIZE))
  const pagedPersonnel = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredPersonnel.slice(start, start + PAGE_SIZE)
  }, [filteredPersonnel, page])

  // 当前页人员 ID（用于"全选当前页"）
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
        // 取消当前页全选
        for (const id of currentPageIds) next.delete(id)
      } else {
        // 选中当前页全部
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

  const openAdd = () => {
    setName('')
    setBatchText('')
    setAddTab('single')
    setAddBranchId(canSelectBranch ? undefined : user?.branchId ?? undefined)
    setAddOpen(true)
  }

  const handleSubmit = async () => {
    const targetBranchId = canSelectBranch ? addBranchId : user?.branchId
    if (!targetBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }
    if (addTab === 'single') {
      if (!name.trim()) {
        toast.error('请输入姓名')
        return
      }
      setSubmitting(true)
      try {
        await personnelApi.create({ name: name.trim(), branchId: targetBranchId })
        toast.success('添加成功')
        setAddOpen(false)
        await loadPersonnel()
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setSubmitting(false)
      }
    } else {
      const names = batchText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      if (names.length === 0) {
        toast.error('请粘贴名单（每行一个姓名）')
        return
      }
      setSubmitting(true)
      try {
        const result = await personnelApi.batchCreate(names, targetBranchId)
        toast.success(
          `导入完成：成功 ${result.success} 人，失败 ${result.failed} 人`,
        )
        if (result.createdPersons.length > 0) {
          toast.info(
            `已添加人员：${result.createdPersons.slice(0, 20).join('、')}${
              result.createdPersons.length > 20
                ? ` 等 ${result.createdPersons.length} 人`
                : ''
            }`,
          )
        }
        if (result.failures.length > 0) {
          const failedNames = result.failures.map((f) => f.name).join('、')
          toast.error(`失败人员：${failedNames}`)
        }
        setAddOpen(false)
        await loadPersonnel()
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setSubmitting(false)
      }
    }
  }

  // ============ 编辑信息（单人：改名+主持 / 多人：批量主持）============
  // 单人入口：操作列点击 Pencil 图标
  const openEditSingle = (p: PersonnelType) => {
    if (!effectiveBranchId) {
      toast.error('请先选择厅')
      return
    }
    setEditTargets([p])
    setEditName('')
    // 初始 host 模式为 keep（不修改），单人弹窗中显示当前状态作为参考
    setEditHostMode('keep')
    setEditOpen(true)
  }

  // 多人入口：工具栏"批量编辑"按钮
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
    setEditName('')
    setEditHostMode('keep')
    setEditOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!effectiveBranchId) {
      toast.error('请先选择厅')
      return
    }
    const isBatch = editTargets.length > 1

    // 校验：必须至少有一项变更
    if (isBatch) {
      if (editHostMode === 'keep') {
        toast.error('请选择主持标记操作（标记为主持 / 取消主持）')
        return
      }
    } else {
      const target = editTargets[0]
      const trimmed = editName.trim()
      const nameChanged = trimmed.length > 0 && trimmed !== target.name
      const hostChanged = editHostMode !== 'keep'
      if (!nameChanged && !hostChanged) {
        toast.error('信息未变更')
        return
      }
    }

    setEditing(true)
    try {
      const tasks: Promise<unknown>[] = []

      if (!isBatch) {
        const target = editTargets[0]
        const trimmed = editName.trim()
        // 单人改名
        if (trimmed.length > 0 && trimmed !== target.name) {
          tasks.push(personnelApi.rename(target.id, trimmed, effectiveBranchId))
        }
        // 单人主持切换
        if (editHostMode !== 'keep') {
          tasks.push(
            personnelApi.toggleHost(
              target.id,
              effectiveBranchId,
              editHostMode === 'on',
            ),
          )
        }
      } else {
        // 批量：仅支持主持标记
        for (const target of editTargets) {
          tasks.push(
            personnelApi.toggleHost(
              target.id,
              effectiveBranchId,
              editHostMode === 'on',
            ),
          )
        }
      }

      await Promise.all(tasks)
      toast.success(isBatch ? '批量编辑完成' : '修改成功')
      setEditOpen(false)
      // 批量编辑后清空多选
      if (isBatch) setSelectedIds(new Set())
      await loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setEditing(false)
    }
  }

  // ============ 删除人员（需密码二次确认）============
  const openDelete = (p: PersonnelType) => {
    setDeleteTarget(p)
    setDeletePassword('')
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const targetBranchId = effectiveBranchId ?? deleteTarget.branches?.[0]?.id
    if (!targetBranchId) {
      toast.error('无法确定人员所属厅')
      return
    }
    if (!deletePassword) {
      toast.error('请输入登录密码')
      return
    }
    setDeleting(true)
    try {
      await personnelApi.delete(
        deleteTarget.id,
        targetBranchId,
        deletePassword,
      )
      toast.success('删除成功')
      setDeleteOpen(false)
      setDeleteTarget(null)
      setDeletePassword('')
      // 删除后从多选中移除
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      await loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // 导出人员名单（Excel/CSV）
  const handleExportPersonnel = async (type: 'excel' | 'csv') => {
    setExportDropdownOpen(false)
    setExporting(type)
    try {
      const blob =
        type === 'excel'
          ? await exportApi.exportPersonnelExcel(effectiveBranchId)
          : await exportApi.exportPersonnelCSV(effectiveBranchId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const branchName = effectiveBranchId
        ? branches.find((b) => b.id === effectiveBranchId)?.name ?? '全部厅'
        : '全部授权厅'
      a.download = `${branchName}_人员名单_${formatDate(new Date())}.${type === 'excel' ? 'xlsx' : 'csv'}`
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

  // 批量导入名单预览
  const batchPreviewCount = useMemo(() => {
    const names = batchText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return new Set(names).size
  }, [batchText])

  const hasBranchSelected = effectiveBranchId !== undefined

  // 当前选中厅的统计周期（按月统计厅显示"本月数据状态"）
  // 优先从 branches 列表获取，回退到 personnel 数据中的 branches 字段
  const dataStatusLabel = useMemo(() => {
    const currentBranch = branches.find((b) => b.id === effectiveBranchId)
    const currentPersonnelBranch = personnel
      .flatMap((p) => p.branches ?? [])
      .find((b) => b.id === effectiveBranchId)
    const branchStatCycle = currentBranch?.statCycle ?? currentPersonnelBranch?.statCycle
    const isMonthCycle = branchStatCycle === 'MONTH'
    return isMonthCycle ? '本月数据状态' : '本周数据状态'
  }, [branches, effectiveBranchId, personnel])

  // 编辑弹窗是否为批量模式
  const isBatchEdit = editTargets.length > 1
  // 单人模式：当前主持状态
  const singleCurrentHost = useMemo(() => {
    if (isBatchEdit || editTargets.length === 0) return false
    const target = editTargets[0]
    return (
      target.branches?.find((b) => b.id === effectiveBranchId)?.isHost ?? false
    )
  }, [editTargets, effectiveBranchId, isBatchEdit])

  return (
    <div className="space-y-5">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-textSecondary" />
          <h3 className="text-base font-semibold text-textPrimary">人员名单</h3>
        </div>
        <div className="flex items-center gap-2">
          {canSelectBranch && (
            <GroupedSelect
              value={branchId !== undefined ? String(branchId) : (isChaoguan ? String(user?.branchId ?? '') : '')}
              onChange={(val) =>
                setBranchId(val ? Number(val) : undefined)
              }
              placeholder="选择厅"
              topOption={isHuizhang ? { value: '', label: '选择厅' } : undefined}
              options={branches.map((b) => ({
                value: String(b.id),
                label: b.name,
              }))}
              minWidth={160}
            />
          )}
          {/* 批量编辑按钮：仅在选中时显示 */}
          {canEdit && selectedCount > 0 && (
            <button
              onClick={openEditBatch}
              disabled={!hasBranchSelected}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              <CheckSquare size={16} />
              批量编辑（{selectedCount} 人）
            </button>
          )}
          <button
            onClick={openAdd}
            disabled={!canAdd || !hasBranchSelected}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            title={!hasBranchSelected ? '请先选择厅' : undefined}
          >
            <Plus size={16} />
            添加人员
          </button>
          {canAdd && (
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                disabled={!hasBranchSelected || exporting !== null}
                className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-textPrimary rounded-custom-sm text-sm font-medium hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title={!hasBranchSelected ? '请先选择厅' : undefined}
              >
                <Download size={16} />
                {exporting ? '导出中...' : '导出名单'}
              </button>
              {exportDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setExportDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-1 w-32 bg-card border border-border rounded-custom-sm shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => handleExportPersonnel('excel')}
                      className="w-full text-left px-3 py-2 text-sm text-textPrimary hover:bg-surface transition-colors duration-200 cursor-pointer"
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      onClick={() => handleExportPersonnel('csv')}
                      className="w-full text-left px-3 py-2 text-sm text-textPrimary hover:bg-surface transition-colors duration-200 cursor-pointer border-t border-border"
                    >
                      CSV (.csv)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 未选厅时提示 */}
      {!hasBranchSelected ? (
        <div className="art-card px-5 py-16 text-center text-sm text-textMuted">
          请先选择厅
        </div>
      ) : (
        <>
          {/* 搜索框 */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索姓名（支持中文首字母）"
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

          {/* 人员表格 */}
          <div className="art-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    {(canEdit || canDelete) && (
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
                    <th className="px-4 py-3 font-medium">所属厅</th>
                    <th className="px-4 py-3 font-medium">主持</th>
                    <th className="px-4 py-3 font-medium">{dataStatusLabel}</th>
                    {(canEdit || canDelete) && (
                      <th className="px-4 py-3 font-medium text-right">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {Array.from({
                          length: (canEdit || canDelete ? 1 : 0) + 5 + (canEdit || canDelete ? 1 : 0),
                        }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : pagedPersonnel.length === 0 ? (
                    <tr>
                      <td
                        colSpan={(canEdit || canDelete ? 1 : 0) + 5 + (canEdit || canDelete ? 1 : 0)}
                        className="px-4 py-16 text-center"
                      >
                        <div className="flex flex-col items-center gap-2 text-textMuted">
                          <UserX size={32} className="opacity-40" />
                          <span className="text-sm">
                            {searchTerm ? '未找到匹配的人员' : '暂无人员'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedPersonnel.map((p, idx) => {
                      // 当前厅的主持状态（按厅独立标记）
                      const currentBranchHost =
                        p.branches?.find((b) => b.id === effectiveBranchId)
                          ?.isHost ?? false
                      const isSelected = selectedIds.has(p.id)
                      return (
                      <tr
                        key={p.id}
                        className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                          isSelected ? 'bg-primary/5' : ''
                        }`}
                      >
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="checkbox-round"
                              checked={isSelected}
                              onChange={() => toggleSelect(p.id)}
                              aria-label={`选择 ${p.name}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-textMuted font-mono">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-textPrimary font-medium">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-textSecondary">
                          {p.branches?.map((b) => b.name).join('、') || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {currentBranchHost ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              <Star
                                size={12}
                                className="fill-amber-500 text-amber-500"
                              />
                              主持
                            </span>
                          ) : (
                            <span className="text-textMuted text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {p.hasDataThisWeek ? (
                            <span className="inline-flex items-center gap-1.5 text-success bg-success/10 px-2 py-0.5 rounded-full text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              已录入
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-warning bg-warning/10 px-2 py-0.5 rounded-full text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                              未录入
                            </span>
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <button
                                  onClick={() => openEditSingle(p)}
                                  className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                                  title="编辑信息"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => openDelete(p)}
                                  className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                                  title="删除"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
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
                  className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  aria-label="上一页"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 py-1 text-sm text-textPrimary font-mono">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 border border-border rounded-custom-sm bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                  aria-label="下一页"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 添加人员弹窗（单个添加 / 批量导入） */}
      <Modal
        open={addOpen}
        title="添加人员"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button
              onClick={() => setAddOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {submitting && <Spinner className="h-4 w-4" />}
              {submitting
                ? '处理中...'
                : addTab === 'single'
                  ? '添加'
                  : '导入'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 标签页切换 */}
          <div className="flex gap-1 p-1 bg-surface rounded-custom-sm border border-border">
            <button
              onClick={() => setAddTab('single')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-custom-sm text-sm font-medium transition-colors duration-200 cursor-pointer ${
                addTab === 'single'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Plus size={14} />
              单个添加
            </button>
            <button
              onClick={() => setAddTab('batch')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-custom-sm text-sm font-medium transition-colors duration-200 cursor-pointer ${
                addTab === 'batch'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Upload size={14} />
              批量导入
            </button>
          </div>

          {/* 单个添加 */}
          {addTab === 'single' && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">姓名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入人员姓名"
                className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
              />
            </div>
          )}

          {/* 批量导入 */}
          {addTab === 'batch' && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                人员名单
                <span className="ml-1 text-textMuted">
                  （每行一个姓名，自动去重）
                </span>
              </label>
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={'张三\n李四\n王五\n赵六'}
                rows={8}
                className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 resize-y font-mono"
              />
              {batchPreviewCount > 0 && (
                <p className="mt-1 text-xs text-textMuted">
                  共 {batchPreviewCount} 人（去重后）
                </p>
              )}
            </div>
          )}

          {/* 所属厅选择 */}
          {canSelectBranch ? (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                所属厅
              </label>
              <GroupedSelect
                value={addBranchId !== undefined ? String(addBranchId) : ''}
                onChange={(val) =>
                  setAddBranchId(val ? Number(val) : undefined)
                }
                placeholder="请选择厅"
                fullWidth
                topOption={{ value: '', label: '请选择厅' }}
                options={branches.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
              />
            </div>
          ) : (
            <p className="text-xs text-textMuted">
              人员将添加到当前账户所属厅
            </p>
          )}
        </div>
      </Modal>

      {/* 编辑信息弹窗（单人：改名+主持 / 多人：批量主持） */}
      <Modal
        open={editOpen}
        title={isBatchEdit ? `批量编辑（${editTargets.length} 人）` : '编辑信息'}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button
              onClick={() => setEditOpen(false)}
              disabled={editing}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleEditSubmit}
              disabled={editing}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {editing && <Spinner className="h-4 w-4" />}
              {editing ? '处理中...' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 多人时显示已选人员 */}
          {isBatchEdit && (
            <div className="p-3 rounded-custom-sm bg-surface border border-border">
              <div className="text-xs text-textSecondary mb-1.5">
                已选 {editTargets.length} 人
              </div>
              <div className="text-sm text-textPrimary leading-relaxed">
                {editTargets
                  .slice(0, 5)
                  .map((p) => p.name)
                  .join('、')}
                {editTargets.length > 5 &&
                  ` 等 ${editTargets.length} 人`}
              </div>
            </div>
          )}

          {/* 单人显示当前姓名 */}
          {!isBatchEdit && editTargets.length === 1 && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                当前姓名
              </label>
              <p className="text-sm text-textMuted">{editTargets[0].name}</p>
            </div>
          )}

          {/* 新姓名输入框：仅单人可填 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              {isBatchEdit ? (
                <span className="text-textMuted">
                  新姓名（批量操作不支持改名）
                </span>
              ) : (
                '新姓名'
              )}
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={
                isBatchEdit
                  ? '批量操作不支持改名，请在单人编辑时修改'
                  : '留空则不改名'
              }
              disabled={isBatchEdit}
              maxLength={50}
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* 主持标记：单人 toggle / 多人 3态单选 */}
          <div className="py-2 border-t border-border">
            <div className="text-sm text-textPrimary mb-2 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" />
              主持标记
            </div>
            {isBatchEdit ? (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setEditHostMode('keep')}
                  className={`px-3 py-1.5 rounded-custom-sm text-xs font-medium transition-colors duration-200 cursor-pointer border ${
                    editHostMode === 'keep'
                      ? 'bg-surface text-textPrimary border-border'
                      : 'bg-card text-textSecondary border-border hover:text-textPrimary'
                  }`}
                >
                  不修改
                </button>
                <button
                  type="button"
                  onClick={() => setEditHostMode('on')}
                  className={`px-3 py-1.5 rounded-custom-sm text-xs font-medium transition-colors duration-200 cursor-pointer border ${
                    editHostMode === 'on'
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                      : 'bg-card text-textSecondary border-border hover:text-amber-600 hover:border-amber-300'
                  }`}
                >
                  标记为主持
                </button>
                <button
                  type="button"
                  onClick={() => setEditHostMode('off')}
                  className={`px-3 py-1.5 rounded-custom-sm text-xs font-medium transition-colors duration-200 cursor-pointer border ${
                    editHostMode === 'off'
                      ? 'bg-danger/10 text-danger border-danger/30'
                      : 'bg-card text-textSecondary border-border hover:text-danger hover:border-danger/40'
                  }`}
                >
                  取消主持
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setEditHostMode(
                    singleCurrentHost
                      ? editHostMode === 'keep'
                        ? 'off'
                        : 'keep'
                      : editHostMode === 'keep'
                        ? 'on'
                        : 'keep',
                  )
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-custom-sm text-xs font-medium transition-colors duration-200 cursor-pointer border ${
                  editHostMode === 'on'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                    : editHostMode === 'off'
                      ? 'bg-danger/10 text-danger border-danger/30'
                      : singleCurrentHost
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                        : 'bg-card text-textSecondary border-border hover:text-amber-600 hover:border-amber-300'
                }`}
              >
                <Star
                  size={12}
                  className={
                    editHostMode === 'on' ||
                    (editHostMode === 'keep' && singleCurrentHost)
                      ? 'fill-amber-500 text-amber-500'
                      : ''
                  }
                />
                {editHostMode === 'on'
                  ? '将标记为主持'
                  : editHostMode === 'off'
                    ? '将取消主持'
                    : singleCurrentHost
                      ? '当前为主持（不修改）'
                      : '当前非主持（不修改）'}
              </button>
            )}
            {isBatchEdit && editHostMode === 'off' && (
              <p className="mt-2 text-xs text-warning">
                取消主持标记将删除选中人员在本厅的所有历史流水记录，此操作不可撤销。
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* 删除确认弹窗（需输入登录密码） */}
      <Modal
        open={deleteOpen}
        title="删除人员确认"
        onClose={() => {
          setDeleteOpen(false)
          setDeleteTarget(null)
          setDeletePassword('')
        }}
        footer={
          <>
            <button
              onClick={() => {
                setDeleteOpen(false)
                setDeleteTarget(null)
                setDeletePassword('')
              }}
              disabled={deleting}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || !deletePassword}
              className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-custom-sm text-sm font-medium hover:bg-danger/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {deleting ? <Spinner className="h-4 w-4" /> : <Trash2 size={16} />}
              {deleting ? '删除中...' : '确认删除'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div
            className={`p-3 rounded-custom-sm border ${
              deleteTarget?.hasDataThisWeek
                ? 'bg-danger/10 border-danger/20'
                : 'bg-warning/10 border-warning/20'
            }`}
          >
            <p className="text-sm font-medium text-textPrimary">
              即将删除人员「{deleteTarget?.name}」
            </p>
            <p className="text-xs text-textSecondary mt-1 leading-relaxed">
              {deleteTarget?.hasDataThisWeek
                ? '该人员本周/本月已有数据记录。删除后将永久删除该人员及其在本厅的所有历史数据记录（含数据、扣减、主持流水、无福利标记），且无法恢复。'
                : '该操作将解除该人员与当前厅的关联，并删除其在本厅的所有历史数据记录，且无法恢复。'}
            </p>
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              请输入您的登录密码以确认删除
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deletePassword && !deleting) {
                  handleDelete()
                }
              }}
              placeholder="登录密码"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
