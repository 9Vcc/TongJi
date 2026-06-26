import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  Trash2,
  Ban,
  CheckCircle,
  UserPlus,
  Pencil,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  accountsApi,
  branchesApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Modal from '../../components/Modal'
import { Skeleton, Spinner } from '../../components/Skeleton'
import SubPageHeader from '../../components/SubPageHeader'
import { getRoleText } from '../../utils'
import type { User, Branch, Role, AccountStatus } from '../../types'

export default function AccountsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canManageAccounts = isHuizhang || isChaoguan

  const [accounts, setAccounts] = useState<User[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<User | null>(null)
  const [accountForm, setAccountForm] = useState({
    username: '',
    password: '',
    role: 'GUANLI' as Role,
    branchId: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])

  const loadAccounts = async () => {
    if (!canManageAccounts) return
    setAccountsLoading(true)
    try {
      const list = await accountsApi.list()
      const filtered = list.filter((a) => {
        if (isHuizhang)
          return (
            (a.role === 'CHAOGUAN' ||
              a.role === 'GUANLI' ||
              a.role === 'HUIZHANG') &&
            a.id !== user?.id
          )
        if (isChaoguan)
          return a.role === 'GUANLI' && a.branchId === user?.branchId
        return false
      })
      setAccounts(filtered)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAccountsLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
    if (isHuizhang) {
      branchesApi.list().then(setBranches).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuizhang, isChaoguan, user])

  const openAddAccountModal = () => {
    setEditingAccount(null)
    setAccountForm({
      username: '',
      password: '',
      role: 'GUANLI',
      branchId: isHuizhang ? '' : String(user?.branchId ?? ''),
    })
    setShowPassword(false)
    setAccountModalOpen(true)
  }

  const openEditAccountModal = (account: User) => {
    setEditingAccount(account)
    setAccountForm({
      username: account.username,
      password: '',
      role: account.role,
      branchId: account.branchId ? String(account.branchId) : '',
    })
    setShowPassword(false)
    setAccountModalOpen(true)
  }

  const handleAccountSubmit = async () => {
    if (!accountForm.username.trim()) {
      toast.error('请填写用户名')
      return
    }
    if (!editingAccount && !accountForm.password.trim()) {
      toast.error('请填写密码')
      return
    }

    const targetBranchId = isHuizhang
      ? accountForm.branchId
        ? Number(accountForm.branchId)
        : undefined
      : user?.branchId ?? undefined

    if (accountForm.role !== 'HUIZHANG' && !targetBranchId) {
      toast.error(isHuizhang ? '请选择厅' : '当前账户未关联厅')
      return
    }

    setAccountSubmitting(true)
    try {
      if (editingAccount) {
        const payload: Record<string, unknown> = {}
        if (accountForm.username.trim() !== editingAccount.username) {
          payload.username = accountForm.username.trim()
        }
        if (accountForm.password) {
          payload.password = accountForm.password
        }
        if (accountForm.role !== editingAccount.role) {
          payload.role = accountForm.role
        }
        const newBranchId = targetBranchId
        if (newBranchId !== editingAccount.branchId) {
          payload.branchId = newBranchId
        }
        if (Object.keys(payload).length === 0) {
          toast.info('没有需要更新的字段')
          setAccountModalOpen(false)
          return
        }
        await accountsApi.update(editingAccount.id, payload)
        toast.success('账户更新成功')
      } else {
        await accountsApi.create({
          username: accountForm.username.trim(),
          password: accountForm.password,
          role: accountForm.role,
          branchId: targetBranchId,
        })
        toast.success('账户创建成功')
      }
      setAccountModalOpen(false)
      await loadAccounts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAccountSubmitting(false)
    }
  }

  const handleAccountStatus = async (account: User) => {
    const newStatus: AccountStatus =
      account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    try {
      await accountsApi.updateStatus(account.id, newStatus)
      toast.success(newStatus === 'ACTIVE' ? '已启用' : '已禁用')
      await loadAccounts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleAccountDelete = async (account: User) => {
    if (!window.confirm(`确认删除账户「${account.username}」？`)) return
    try {
      await accountsApi.delete(account.id)
      toast.success('删除成功')
      await loadAccounts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const getBranchName = (account: User) => {
    return account.branch?.name || branches.find((b) => b.id === account.branchId)?.name || '-'
  }

  if (!canManageAccounts) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="账户管理"
        desc="创建、编辑、禁用或删除系统账户，分配角色与厅"
      />
      <motion.div
        className="bg-card border border-border rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              账户管理
            </h3>
          </div>
          <button
            onClick={openAddAccountModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
          >
            <UserPlus size={16} />
            添加账户
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                <th className="px-3 py-2 font-medium">用户名</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">厅</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {accountsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-textMuted"
                  >
                    暂无账户
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                  >
                    <td className="px-3 py-2 text-textPrimary font-medium">
                      {a.username}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                        {getRoleText(a.role)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-textSecondary">
                      {getBranchName(a)}
                    </td>
                    <td className="px-3 py-2">
                      {a.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1.5 text-success bg-success/10 px-2 py-0.5 rounded-full text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          正常
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-textMuted bg-textMuted/10 px-2 py-0.5 rounded-full text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-textMuted" />
                          禁用
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditAccountModal(a)}
                          className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                          title="编辑"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleAccountStatus(a)}
                          className="p-1.5 text-textSecondary hover:text-warning hover:bg-warning/10 rounded transition-colors duration-200 cursor-pointer"
                          title={a.status === 'ACTIVE' ? '禁用' : '启用'}
                        >
                          {a.status === 'ACTIVE' ? (
                            <Ban size={16} />
                          ) : (
                            <CheckCircle size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => handleAccountDelete(a)}
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
      </motion.div>

      {/* 添加/编辑账户弹窗 */}
      <Modal
        open={accountModalOpen}
        title={editingAccount ? '编辑账户' : '添加账户'}
        onClose={() => setAccountModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setAccountModalOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleAccountSubmit}
              disabled={accountSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {accountSubmitting && <Spinner className="h-4 w-4" />}
              {accountSubmitting
                ? '提交中...'
                : editingAccount
                  ? '保存'
                  : '创建'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 用户名 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              用户名
            </label>
            <input
              type="text"
              value={accountForm.username}
              onChange={(e) =>
                setAccountForm({ ...accountForm, username: e.target.value })
              }
              placeholder="请输入用户名"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              {editingAccount ? (
                <span className="flex items-center gap-1">
                  <Key size={12} />
                  新密码（留空则不修改）
                </span>
              ) : (
                '密码'
              )}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={accountForm.password}
                onChange={(e) =>
                  setAccountForm({ ...accountForm, password: e.target.value })
                }
                placeholder={
                  editingAccount ? '输入新密码以修改' : '请输入密码'
                }
                className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-textMuted hover:text-textSecondary transition-colors duration-200 cursor-pointer"
                title={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 角色 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              角色
            </label>
            <select
              value={accountForm.role}
              onChange={(e) =>
                setAccountForm({
                  ...accountForm,
                  role: e.target.value as Role,
                })
              }
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
            >
              {isHuizhang && <option value="HUIZHANG">会长</option>}
              {isHuizhang && <option value="CHAOGUAN">超管</option>}
              <option value="GUANLI">管理</option>
            </select>
          </div>

          {/* 所属厅 */}
          {isHuizhang && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                所属厅
                {accountForm.role === 'HUIZHANG' && (
                  <span className="text-textMuted">（会长可不绑定厅）</span>
                )}
              </label>
              <select
                value={accountForm.branchId}
                onChange={(e) =>
                  setAccountForm({ ...accountForm, branchId: e.target.value })
                }
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                <option value="">
                  {accountForm.role === 'HUIZHANG'
                    ? '不绑定厅'
                    : '请选择厅'}
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
