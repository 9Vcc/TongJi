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
  AlertTriangle,
} from 'lucide-react'
import {
  accountsApi,
  branchesApi,
  branchGroupsApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Modal from '../../components/Modal'
import { Skeleton, Spinner } from '../../components/Skeleton'
import GroupedSelect from '../../components/GroupedSelect'
import SubPageHeader from '../../components/SubPageHeader'
import { getRoleText } from '../../utils'
import type { User, Branch, BranchGroup, Role, AccountStatus } from '../../types'

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
    nickname: '',
    password: '',
    role: 'GUANLI' as Role,
    // 所有授权厅（包含主厅）；第一个勾选的为主厅，其余为额外授权厅
    branchIds: [] as number[],
    // 授权合厅组（仅超管角色生效）
    groupIds: [] as number[],
    // 主合厅组 ID：null 表示主厅为 branchIds[0]；非 null 表示主厅为该合厅组
    mainGroupId: null as number | null,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([])

  // 确认弹窗（禁用/启用/删除账户）
  // type 区分操作类型，account 为目标账户
  type ConfirmAction = { type: 'status' | 'delete'; account: User }
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)

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
      branchGroupsApi.list().then(setBranchGroups).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuizhang, isChaoguan, user])

  const openAddAccountModal = () => {
    setEditingAccount(null)
    setAccountForm({
      username: '',
      nickname: '',
      password: '',
      role: 'GUANLI',
      branchIds: [],
      groupIds: [],
      mainGroupId: null,
    })
    setShowPassword(false)
    setAccountModalOpen(true)
  }

  const openEditAccountModal = (account: User) => {
    setEditingAccount(account)
    // 合并主厅 + 额外授权厅为统一列表（主厅放第一位）
    const allBranchIds = account.branchId
      ? [account.branchId, ...(account.branchIds ?? []).filter((id) => id !== account.branchId)]
      : (account.branchIds ?? [])
    setAccountForm({
      username: account.username,
      nickname: account.nickname ?? '',
      password: '',
      role: account.role,
      branchIds: allBranchIds,
      groupIds: account.groupIds ?? [],
      mainGroupId: account.mainGroupId ?? null,
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

    const isChaoguanRole = accountForm.role === 'CHAOGUAN'
    // 超管角色：主厅可以是合厅组（mainGroupId）或厅（branchIds[0]）
    // 当 mainGroupId 非空时，主厅为合厅组，branchId 可为 null
    // 当 mainGroupId 为空时，主厅为 branchIds[0]
    const mainBranchId = accountForm.branchIds[0]
    const extraBranchIds = accountForm.branchIds.slice(1)
    const hasMainGroup = isChaoguanRole && accountForm.mainGroupId !== null

    // 会长设置目标厅：有主合厅组时 branchId 可为 null，否则取第一个勾选厅
    // 超管/管理自动绑定到自己所在厅
    let targetBranchId: number | null | undefined
    if (isHuizhang) {
      targetBranchId = hasMainGroup ? null : mainBranchId
    } else {
      targetBranchId = user?.branchId ?? undefined
    }

    // 非会长角色必须至少有一个主厅（厅或合厅组）
    if (accountForm.role !== 'HUIZHANG' && !hasMainGroup && !targetBranchId) {
      toast.error('请至少选择一个授权厅或合厅组作为主厅')
      return
    }

    setAccountSubmitting(true)
    try {
      if (editingAccount) {
        const payload: Record<string, unknown> = {}
        if (accountForm.username.trim() !== editingAccount.username) {
          payload.username = accountForm.username.trim()
        }
        // 昵称变化即提交（包含清空场景：原值非空 -> 空字符串）
        const originalNickname = editingAccount.nickname ?? ''
        if (accountForm.nickname.trim() !== originalNickname) {
          payload.nickname = accountForm.nickname.trim()
        }
        if (accountForm.password) {
          payload.password = accountForm.password
        }
        if (accountForm.role !== editingAccount.role) {
          payload.role = accountForm.role
        }
        // 主厅变化（branchId）
        const originalHasMainGroup = editingAccount.mainGroupId !== null && editingAccount.mainGroupId !== undefined
        const originalBranchId = originalHasMainGroup ? null : editingAccount.branchId
        if (targetBranchId !== originalBranchId) {
          payload.branchId = targetBranchId
        }
        // 额外授权厅变化（仅 CHAOGUAN 角色）
        if (isChaoguanRole) {
          const originalExtra = editingAccount.branchId
            ? (editingAccount.branchIds ?? []).filter((id) => id !== editingAccount.branchId)
            : (editingAccount.branchIds ?? [])
          const isSame =
            extraBranchIds.length === originalExtra.length &&
            extraBranchIds.every((id) => originalExtra.includes(id))
          if (!isSame) {
            payload.branchIds = extraBranchIds
          }
          // 授权合厅组变化
          const originalGroupIds = editingAccount.groupIds ?? []
          const isGroupsSame =
            accountForm.groupIds.length === originalGroupIds.length &&
            accountForm.groupIds.every((id) => originalGroupIds.includes(id))
          if (!isGroupsSame) {
            payload.groupIds = accountForm.groupIds
          }
          // 主合厅组变化
          const originalMainGroupId = editingAccount.mainGroupId ?? null
          if (accountForm.mainGroupId !== originalMainGroupId) {
            payload.mainGroupId = accountForm.mainGroupId
          }
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
          nickname: accountForm.nickname.trim() || undefined,
          password: accountForm.password,
          role: accountForm.role,
          branchId: targetBranchId ?? undefined,
          branchIds: isChaoguanRole ? extraBranchIds : undefined,
          groupIds: isChaoguanRole ? accountForm.groupIds : undefined,
          mainGroupId: isChaoguanRole ? accountForm.mainGroupId : undefined,
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

  // 打开禁用/启用确认弹窗
  const handleAccountStatus = (account: User) => {
    setConfirmAction({ type: 'status', account })
  }

  // 打开删除确认弹窗
  const handleAccountDelete = (account: User) => {
    setConfirmAction({ type: 'delete', account })
  }

  // 确认弹窗提交
  const handleConfirmSubmit = async () => {
    if (!confirmAction) return
    const { type, account } = confirmAction
    setConfirmSubmitting(true)
    try {
      if (type === 'status') {
        const newStatus: AccountStatus =
          account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
        await accountsApi.updateStatus(account.id, newStatus)
        toast.success(newStatus === 'ACTIVE' ? '已启用' : '已禁用')
      } else {
        await accountsApi.delete(account.id)
        toast.success('删除成功')
      }
      setConfirmAction(null)
      await loadAccounts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setConfirmSubmitting(false)
    }
  }

  // 获取账户的授权厅与合厅组展示（主厅标记在第一位）
  const getAuthDisplay = (account: User) => {
    const items: { name: string; type: 'branch' | 'group'; isMain: boolean }[] = []
    // 主厅为合厅组时优先显示
    if (account.mainGroupId && account.mainGroup) {
      items.push({ name: account.mainGroup.name, type: 'group', isMain: true })
    }
    // 主厅为厅时优先显示
    if (account.branchId && account.branch) {
      items.push({ name: account.branch.name, type: 'branch', isMain: account.mainGroupId === null || account.mainGroupId === undefined })
    } else if (account.branchId) {
      const branchName = branches.find((b) => b.id === account.branchId)?.name
      if (branchName) {
        items.push({ name: branchName, type: 'branch', isMain: account.mainGroupId === null || account.mainGroupId === undefined })
      }
    }
    // 额外授权厅
    if (account.branches) {
      for (const b of account.branches) {
        if (b.id !== account.branchId) {
          items.push({ name: b.name, type: 'branch', isMain: false })
        }
      }
    }
    // 授权合厅组（非主厅）
    if (account.groups) {
      for (const g of account.groups) {
        if (g.id !== account.mainGroupId) {
          items.push({ name: g.name, type: 'group', isMain: false })
        }
      }
    }
    return items
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
        className="art-card p-5"
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
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
                <th className="px-3 py-2 font-medium">昵称</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">授权厅与合厅组</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {accountsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                    <td className="px-3 py-2 text-textSecondary">
                      {a.nickname || (
                        <span className="text-textMuted">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                        {getRoleText(a.role)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-textSecondary">
                      <div className="flex flex-wrap items-center gap-1">
                        {getAuthDisplay(a).length === 0 ? (
                          <span className="text-textMuted">-</span>
                        ) : (
                          getAuthDisplay(a).map((item, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                                item.isMain
                                  ? 'bg-primary/10 text-primary border border-primary/20'
                                  : 'bg-surface text-textSecondary'
                              }`}
                            >
                              {item.isMain && (
                                <span className="font-medium">主厅</span>
                              )}
                              <span>{item.name}</span>
                              <span
                                className={`text-[9px] ${
                                  item.type === 'group' ? 'text-primary' : 'text-textMuted'
                                }`}
                              >
                                {item.type === 'group' ? '组' : '厅'}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
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
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleAccountSubmit}
              disabled={accountSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>

          {/* 昵称 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              昵称
              <span className="ml-1 text-[10px] text-textMuted">（选填，仅展示用）</span>
            </label>
            <input
              type="text"
              maxLength={50}
              value={accountForm.nickname}
              onChange={(e) =>
                setAccountForm({ ...accountForm, nickname: e.target.value })
              }
              placeholder="可选，最多 50 字"
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
                className="w-full px-3 py-2 pr-10 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
            <GroupedSelect
              value={accountForm.role}
              onChange={(val) =>
                setAccountForm({
                  ...accountForm,
                  role: val as Role,
                })
              }
              fullWidth
              options={[
                ...(isHuizhang ? [{ value: 'HUIZHANG', label: '会长' }, { value: 'CHAOGUAN', label: '超管' }] : []),
                { value: 'GUANLI', label: '管理' },
              ]}
            />
          </div>

          {/* 授权厅与合厅组（超管角色合并显示，含主厅设置） */}
          {isHuizhang && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                {accountForm.role === 'CHAOGUAN' ? '授权厅与合厅组' : '授权厅'}
                {accountForm.role === 'HUIZHANG' ? (
                  <span className="text-textMuted">（会长可不绑定厅；第一个勾选的为主厅）</span>
                ) : accountForm.role === 'CHAOGUAN' ? (
                  <span className="text-textMuted">（勾选授权，选一个作为主厅；合厅组可设为主厅）</span>
                ) : (
                  <span className="text-textMuted">（至少勾选一个；第一个勾选的为主厅）</span>
                )}
              </label>
              <div className="max-h-40 overflow-auto border border-border rounded-custom-sm p-2 space-y-0.5">
                {/* 厅列表 */}
                {branches.map((b) => {
                  const checked = accountForm.branchIds.includes(b.id)
                  const isMain =
                    accountForm.role === 'CHAOGUAN'
                      ? accountForm.mainGroupId === null && accountForm.branchIds[0] === b.id
                      : accountForm.branchIds[0] === b.id
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 text-sm rounded px-2 py-1 hover:bg-surface"
                    >
                      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAccountForm({
                                ...accountForm,
                                branchIds: [...accountForm.branchIds, b.id],
                              })
                            } else {
                              // 非会长角色至少保留一个授权厅
                              if (
                                accountForm.role !== 'HUIZHANG' &&
                                accountForm.branchIds.length === 1 &&
                                accountForm.mainGroupId === null
                              ) {
                                toast.error('请至少保留一个授权厅或合厅组')
                                return
                              }
                              setAccountForm({
                                ...accountForm,
                                branchIds: accountForm.branchIds.filter(
                                  (id) => id !== b.id,
                                ),
                              })
                            }
                          }}
                          className="checkbox-round"
                        />
                        <span className="truncate">{b.name}</span>
                        <span className="text-[10px] text-textMuted bg-surface px-1 rounded flex-shrink-0">
                          厅
                        </span>
                      </label>
                      {accountForm.role === 'CHAOGUAN' && checked && (
                        <label className="flex items-center gap-1 cursor-pointer text-[10px] text-textSecondary flex-shrink-0">
                          <input
                            type="radio"
                            name="mainHall"
                            checked={isMain}
                            onChange={() => {
                              // 设为分支主厅：移到首位，清除主合厅组
                              setAccountForm({
                                ...accountForm,
                                branchIds: [
                                  b.id,
                                  ...accountForm.branchIds.filter((id) => id !== b.id),
                                ],
                                mainGroupId: null,
                              })
                            }}
                            className="radio-round"
                          />
                          主厅
                        </label>
                      )}
                      {isMain && accountForm.role !== 'CHAOGUAN' && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
                          主厅
                        </span>
                      )}
                    </div>
                  )
                })}
                {/* 合厅组列表（仅超管角色） */}
                {accountForm.role === 'CHAOGUAN' &&
                  branchGroups.map((g) => {
                    const checked = accountForm.groupIds.includes(g.id)
                    const isMain = accountForm.mainGroupId === g.id
                    const activeCount = g.branches.filter((b) => !b.closed).length
                    return (
                      <div
                        key={g.id}
                        className="flex items-center gap-2 text-sm rounded px-2 py-1 hover:bg-surface"
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAccountForm({
                                  ...accountForm,
                                  groupIds: [...accountForm.groupIds, g.id],
                                })
                              } else {
                                // 取消勾选时，若该合厅组是主厅则清除
                                setAccountForm({
                                  ...accountForm,
                                  groupIds: accountForm.groupIds.filter(
                                    (id) => id !== g.id,
                                  ),
                                  mainGroupId:
                                    accountForm.mainGroupId === g.id
                                      ? null
                                      : accountForm.mainGroupId,
                                })
                              }
                            }}
                            className="checkbox-round"
                          />
                          <span className="truncate">{g.name}</span>
                          <span className="text-[10px] text-primary bg-primary/10 px-1 rounded flex-shrink-0">
                            合厅组
                          </span>
                          <span className="text-[10px] text-textMuted flex-shrink-0">
                            {activeCount}厅
                          </span>
                        </label>
                        {checked && (
                          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-textSecondary flex-shrink-0">
                            <input
                              type="radio"
                              name="mainHall"
                              checked={isMain}
                              onChange={() => {
                                // 设为合厅组主厅
                                setAccountForm({
                                  ...accountForm,
                                  mainGroupId: g.id,
                                })
                              }}
                              className="radio-round"
                            />
                            主厅
                          </label>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 禁用/启用/删除确认弹窗 */}
      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.type === 'delete'
            ? '删除账户'
            : confirmAction?.account.status === 'ACTIVE'
              ? '禁用账户'
              : '启用账户'
        }
        onClose={() => setConfirmAction(null)}
        footer={
          <>
            <button
              onClick={() => setConfirmAction(null)}
              disabled={confirmSubmitting}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleConfirmSubmit}
              disabled={confirmSubmitting}
              className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-custom-sm text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer ${
                confirmAction?.type === 'delete'
                  ? 'bg-danger hover:bg-danger/90'
                  : confirmAction?.account.status === 'ACTIVE'
                    ? 'bg-warning hover:bg-warning/90'
                    : 'bg-primary hover:bg-primary-hover'
              }`}
            >
              {confirmSubmitting && <Spinner className="h-4 w-4" />}
              {confirmSubmitting
                ? '处理中...'
                : confirmAction?.type === 'delete'
                  ? '确认删除'
                  : confirmAction?.account.status === 'ACTIVE'
                    ? '确认禁用'
                    : '确认启用'}
            </button>
          </>
        }
      >
        {confirmAction && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={18}
                className={`flex-shrink-0 mt-0.5 ${
                  confirmAction.type === 'delete'
                    ? 'text-danger'
                    : 'text-warning'
                }`}
              />
              <div className="text-sm text-textSecondary space-y-1">
                {confirmAction.type === 'delete' ? (
                  <>
                    <p className="text-textPrimary font-medium">
                      确认删除账户「{confirmAction.account.username}」？
                    </p>
                    <p className="text-xs text-textMuted">
                      此操作不可撤销，账户关联的数据记录将转交给当前操作人，登录记录与历史记录将被清除。
                    </p>
                  </>
                ) : confirmAction.account.status === 'ACTIVE' ? (
                  <>
                    <p className="text-textPrimary font-medium">
                      确认禁用账户「{confirmAction.account.username}」？
                    </p>
                    <p className="text-xs text-textMuted">
                      禁用后该账户将无法登录系统，可随时重新启用。
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-textPrimary font-medium">
                      确认启用账户「{confirmAction.account.username}」？
                    </p>
                    <p className="text-xs text-textMuted">
                      启用后该账户可正常登录系统。
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
