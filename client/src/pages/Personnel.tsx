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
} from 'lucide-react'
import {
  personnelApi,
  branchesApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { matchNamePinyin } from '../utils'
import Modal from '../components/Modal'
import { Skeleton, Spinner } from '../components/Skeleton'
import type { Personnel as PersonnelType, Branch } from '../types'

type AddTab = 'single' | 'batch'

const PAGE_SIZE = 20

export default function Personnel() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const canDelete = isHuizhang || user?.role === 'CHAOGUAN'
  const canAdd = isHuizhang || user?.role === 'CHAOGUAN'
  const canEdit = isHuizhang || user?.role === 'CHAOGUAN'

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

  // 改名弹窗
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<PersonnelType | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)

  // 删除确认弹窗
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PersonnelType | null>(null)

  const effectiveBranchId = useMemo(() => {
    if (isHuizhang) return branchId
    return user?.branchId ?? undefined
  }, [isHuizhang, branchId, user])

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
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
  }, [isHuizhang])

  // 仅在选了厅时加载人员（会长需选厅；超管/管理有默认 branchId）
  useEffect(() => {
    if (effectiveBranchId !== undefined) {
      loadPersonnel()
    } else {
      setPersonnel([])
    }
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

  const openAdd = () => {
    setName('')
    setBatchText('')
    setAddTab('single')
    setAddBranchId(isHuizhang ? undefined : user?.branchId ?? undefined)
    setAddOpen(true)
  }

  const handleSubmit = async () => {
    const targetBranchId = isHuizhang ? addBranchId : user?.branchId
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

  const openRename = (p: PersonnelType) => {
    setRenameTarget(p)
    setRenameName(p.name)
    setRenameOpen(true)
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const trimmed = renameName.trim()
    if (!trimmed) {
      toast.error('请输入姓名')
      return
    }
    if (trimmed === renameTarget.name) {
      toast.error('姓名未更改')
      return
    }
    setRenaming(true)
    try {
      await personnelApi.rename(renameTarget.id, trimmed, effectiveBranchId)
      toast.success('修改成功')
      setRenameOpen(false)
      await loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRenaming(false)
    }
  }

  const openDelete = (p: PersonnelType) => {
    setDeleteTarget(p)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const targetBranchId = effectiveBranchId ?? deleteTarget.branches?.[0]?.id
    if (!targetBranchId) {
      toast.error('无法确定人员所属厅')
      return
    }
    try {
      await personnelApi.delete(deleteTarget.id, targetBranchId)
      toast.success('移除成功')
      setDeleteOpen(false)
      await loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
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

  return (
    <div className="space-y-5">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-textSecondary" />
          <h3 className="text-base font-semibold text-textPrimary">人员名单</h3>
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
            onClick={openAdd}
            disabled={!canAdd || !hasBranchSelected}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            title={!hasBranchSelected ? '请先选择厅' : undefined}
          >
            <Plus size={16} />
            添加人员
          </button>
        </div>
      </div>

      {/* 未选厅时提示 */}
      {!hasBranchSelected ? (
        <div className="bg-card border border-border rounded-xl px-5 py-16 text-center text-sm text-textMuted">
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
              className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors duration-200"
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
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-textSecondary">
                    <th className="px-4 py-3 font-medium">序号</th>
                    <th className="px-4 py-3 font-medium">姓名</th>
                    <th className="px-4 py-3 font-medium">所属厅</th>
                    <th className="px-4 py-3 font-medium">本周数据状态</th>
                    {(canEdit || canDelete) && (
                      <th className="px-4 py-3 font-medium text-right">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {Array.from({ length: canEdit || canDelete ? 5 : 4 }).map(
                          (_, j) => (
                            <td key={j} className="px-4 py-3">
                              <Skeleton className="h-5 w-full" />
                            </td>
                          ),
                        )}
                      </tr>
                    ))
                  ) : pagedPersonnel.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit || canDelete ? 5 : 4}
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
                    pagedPersonnel.map((p, idx) => (
                      <tr
                        key={p.id}
                        className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                      >
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
                                  onClick={() => openRename(p)}
                                  className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                                  title="改名"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => openDelete(p)}
                                  className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                                  title="移除"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
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
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 border border-border rounded-md bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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
                  className="p-1.5 border border-border rounded-md bg-card text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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
          <div className="flex gap-1 p-1 bg-surface rounded-lg border border-border">
            <button
              onClick={() => setAddTab('single')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer ${
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
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer ${
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
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
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
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 resize-y font-mono"
              />
              {batchPreviewCount > 0 && (
                <p className="mt-1 text-xs text-textMuted">
                  共 {batchPreviewCount} 人（去重后）
                </p>
              )}
            </div>
          )}

          {/* 所属厅选择 */}
          {isHuizhang ? (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                所属厅
              </label>
              <select
                value={addBranchId ?? ''}
                onChange={(e) =>
                  setAddBranchId(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                <option value="">请选择厅</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-textMuted">
              人员将添加到当前账户所属厅
            </p>
          )}
        </div>
      </Modal>

      {/* 改名弹窗 */}
      <Modal
        open={renameOpen}
        title="修改姓名"
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <button
              onClick={() => setRenameOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleRename}
              disabled={renaming}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {renaming && <Spinner className="h-4 w-4" />}
              {renaming ? '处理中...' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              当前姓名
            </label>
            <p className="text-sm text-textMuted">{renameTarget?.name}</p>
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              新姓名
            </label>
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="请输入新姓名"
              autoFocus
              maxLength={50}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        open={deleteOpen}
        title="确认移除"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger-hover transition-colors duration-200 cursor-pointer"
            >
              <Trash2 size={16} />
              确认移除
            </button>
          </>
        }
      >
        <p className="text-sm text-textPrimary">
          确认移除人员「{deleteTarget?.name}」？
        </p>
        <p className="mt-2 text-xs text-textMuted">
          该操作将解除该人员与当前厅的关联。若该人员有数据记录，将无法移除。
        </p>
      </Modal>
    </div>
  )
}
