import { useEffect, useMemo, useState } from 'react'
import { Users, Plus, Trash2, UserX, Upload } from 'lucide-react'
import {
  personnelApi,
  branchesApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import Modal from '../components/Modal'
import { Skeleton, Spinner } from '../components/Skeleton'
import type { Personnel as PersonnelType, Branch } from '../types'

type AddTab = 'single' | 'batch'

export default function Personnel() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const canDelete = isHuizhang || user?.role === 'CHAOGUAN'
  const canAdd = isHuizhang || user?.role === 'CHAOGUAN'

  const [personnel, setPersonnel] = useState<PersonnelType[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  // 单个添加
  const [name, setName] = useState('')
  // 批量导入
  const [addTab, setAddTab] = useState<AddTab>('single')
  const [batchText, setBatchText] = useState('')
  // 公共
  const [addBranchId, setAddBranchId] = useState<number | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

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

  useEffect(() => {
    if (effectiveBranchId !== undefined || isHuizhang) {
      loadPersonnel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, isHuizhang])

  const openAdd = () => {
    setName('')
    setBatchText('')
    setAddTab('single')
    // 会长：默认不选中任何厅（提示"请选择厅"），强制手动选择
    // 超管/管理：使用其所属厅
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
      // 单个添加
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
      // 批量导入
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

  const handleDelete = async (p: PersonnelType) => {
    const targetBranchId = effectiveBranchId ?? p.branches?.[0]?.id
    if (!targetBranchId) {
      toast.error('无法确定人员所属厅')
      return
    }
    if (!window.confirm(`确认移除人员「${p.name}」？`)) return
    try {
      await personnelApi.delete(p.id, targetBranchId)
      toast.success('移除成功')
      await loadPersonnel()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 批量导入名单预览：解析非空姓名数量
  const batchPreviewCount = useMemo(() => {
    const names = batchText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    // 去重统计
    return new Set(names).size
  }, [batchText])

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
              <option value="">全部厅</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={openAdd}
            disabled={!canAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            <Plus size={16} />
            添加人员
          </button>
        </div>
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
                {canDelete && (
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: canDelete ? 5 : 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : personnel.length === 0 ? (
                <tr>
                  <td
                    colSpan={canDelete ? 5 : 4}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-textMuted">
                      <UserX size={32} className="opacity-40" />
                      <span className="text-sm">暂无人员</span>
                    </div>
                  </td>
                </tr>
              ) : (
                personnel.map((p, idx) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                  >
                    <td className="px-4 py-3 text-textMuted font-mono">{idx + 1}</td>
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
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                          title="移除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                    e.target.value ? Number(e.target.value) : undefined
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
    </div>
  )
}
