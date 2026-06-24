import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon,
  Save,
  Plus,
  Trash2,
  Ban,
  CheckCircle,
  Bell,
  Building2,
  UserPlus,
  Shield,
  Pencil,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  rewardRulesApi,
  accountsApi,
  branchesApi,
  notificationsApi,
  getErrorMessage,
} from '../api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import Modal from '../components/Modal'
import { Skeleton, Spinner } from '../components/Skeleton'
import { getRoleText, formatDateTime } from '../utils'
import type {
  User,
  Branch,
  Notification,
  Role,
  AccountStatus,
  UpdateRewardRuleInput,
} from '../types'

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canEditRules = isHuizhang || isChaoguan
  const canManageAccounts = isHuizhang || isChaoguan

  // 奖励规则
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [ruleBranchId, setRuleBranchId] = useState<number | undefined>(
    undefined
  )
  const [ruleForm, setRuleForm] = useState<UpdateRewardRuleInput>({})
  const [savingRules, setSavingRules] = useState(false)
  const [rulesLoading, setRulesLoading] = useState(false)

  // 账户管理
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

  // 分部管理
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchSubmitting, setBranchSubmitting] = useState(false)

  // 通知
  const [notifications, setNotifications] = useState<Notification[]>([])

  const effectiveRuleBranchId = useMemo(() => {
    if (isHuizhang) return ruleBranchId
    return user?.branchId ?? undefined
  }, [isHuizhang, ruleBranchId, user])

  // 加载分部列表
  useEffect(() => {
    if (isHuizhang) {
      setBranchesLoading(true)
      branchesApi
        .list()
        .then(setBranches)
        .catch(() => {})
        .finally(() => setBranchesLoading(false))
    }
  }, [isHuizhang])

  // 加载奖励规则
  useEffect(() => {
    if (!canEditRules) return
    if (isHuizhang && !effectiveRuleBranchId) return
    setRulesLoading(true)
    rewardRulesApi
      .get(effectiveRuleBranchId)
      .then((rs) => {
        const r = rs[0]
        if (r) {
          setRuleForm({
            sgRatio: r.sgRatio,
            qmRatio: r.qmRatio,
            rank1Reward: r.rank1Reward,
            rank2Reward: r.rank2Reward,
            rank3Reward: r.rank3Reward,
            maixuThreshold: r.maixuThreshold,
            maixuReward: r.maixuReward,
          })
        }
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setRulesLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRuleBranchId, canEditRules, isHuizhang])

  // 加载账户列表
  const loadAccounts = async () => {
    if (!canManageAccounts) return
    setAccountsLoading(true)
    try {
      const list = await accountsApi.list()
      const filtered = list.filter((a) => {
        if (isHuizhang) return a.role === 'CHAOGUAN' || a.role === 'GUANLI'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuizhang, isChaoguan, user])

  // 加载通知
  useEffect(() => {
    notificationsApi
      .list()
      .then(setNotifications)
      .catch(() => {})
  }, [])

  const handleSaveRules = async () => {
    if (!effectiveRuleBranchId) {
      toast.error(isHuizhang ? '请选择分部' : '当前账户未关联分部')
      return
    }
    const payload = Object.fromEntries(
      Object.entries(ruleForm).filter(([, v]) => v !== undefined)
    ) as UpdateRewardRuleInput
    if (Object.keys(payload).length === 0) {
      toast.error('请填写至少一个规则字段')
      return
    }
    setSavingRules(true)
    try {
      await rewardRulesApi.update(effectiveRuleBranchId, payload)
      toast.success('规则保存成功')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingRules(false)
    }
  }

  // 打开添加账户弹窗
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

  // 打开编辑账户弹窗
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
    // 新建时密码必填，编辑时密码选填
    if (!editingAccount && !accountForm.password.trim()) {
      toast.error('请填写密码')
      return
    }

    const targetBranchId = isHuizhang
      ? accountForm.branchId
        ? Number(accountForm.branchId)
        : undefined
      : user?.branchId

    if (!targetBranchId) {
      toast.error(isHuizhang ? '请选择分部' : '当前账户未关联分部')
      return
    }

    setAccountSubmitting(true)
    try {
      if (editingAccount) {
        // 编辑模式：只提交有变更的字段
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
        // 新建模式
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

  const handleAddBranch = async () => {
    if (!branchName.trim()) {
      toast.error('请输入分部名称')
      return
    }
    setBranchSubmitting(true)
    try {
      await branchesApi.create(branchName.trim())
      toast.success('分部创建成功')
      setBranchModalOpen(false)
      setBranchName('')
      const list = await branchesApi.list()
      setBranches(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBranchSubmitting(false)
    }
  }

  const handleDeleteBranch = async (branch: Branch) => {
    if (!window.confirm(`确认删除分部「${branch.name}」？`)) return
    try {
      await branchesApi.delete(branch.id)
      toast.success('删除成功')
      const list = await branchesApi.list()
      setBranches(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleMarkRead = async (id: number) => {
    try {
      await notificationsApi.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
    } catch {
      // ignore
    }
  }

  const notificationIcon = (type: Notification['type']) => {
    if (type === 'RULE_CHANGE') return SettingsIcon
    if (type === 'DATA_UPDATE') return CheckCircle
    return Bell
  }

  // 获取账户的分部名称
  const getBranchName = (account: User) => {
    return account.branch?.name || branches.find((b) => b.id === account.branchId)?.name || '-'
  }

  return (
    <div className="space-y-5">
      {/* 上方两栏：奖励规则 + 账户管理 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左栏：奖励规则设置 */}
        {canEditRules && (
          <motion.div
            className="bg-card border border-border rounded-xl p-5"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SettingsIcon size={18} className="text-primary" />
                <h3 className="text-base font-semibold text-textPrimary">
                  奖励规则设置
                </h3>
              </div>
              {isHuizhang && (
                <select
                  value={ruleBranchId ?? ''}
                  onChange={(e) =>
                    setRuleBranchId(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  className="px-3 py-1.5 border border-border rounded-lg bg-card text-sm text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
                >
                  <option value="">选择分部</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {isHuizhang && !effectiveRuleBranchId ? (
              <div className="py-8 text-center text-sm text-textMuted">
                请选择分部以编辑规则
              </div>
            ) : rulesLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-20 mb-1" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-12 mb-1" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput
                    label="收光转换比例"
                    value={ruleForm.sgRatio}
                    onChange={(v) => setRuleForm({ ...ruleForm, sgRatio: v })}
                  />
                  <NumberInput
                    label="全麦转换比例"
                    value={ruleForm.qmRatio}
                    onChange={(v) => setRuleForm({ ...ruleForm, qmRatio: v })}
                  />
                </div>
                <div>
                  <div className="text-xs text-textSecondary mb-2">
                    排名奖励
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <NumberInput
                      label="第1名"
                      value={ruleForm.rank1Reward}
                      onChange={(v) =>
                        setRuleForm({ ...ruleForm, rank1Reward: v })
                      }
                    />
                    <NumberInput
                      label="第2名"
                      value={ruleForm.rank2Reward}
                      onChange={(v) =>
                        setRuleForm({ ...ruleForm, rank2Reward: v })
                      }
                    />
                    <NumberInput
                      label="第3名"
                      value={ruleForm.rank3Reward}
                      onChange={(v) =>
                        setRuleForm({ ...ruleForm, rank3Reward: v })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput
                    label="麦序达标阈值"
                    value={ruleForm.maixuThreshold}
                    onChange={(v) =>
                      setRuleForm({ ...ruleForm, maixuThreshold: v })
                    }
                  />
                  <NumberInput
                    label="麦序达标奖励"
                    value={ruleForm.maixuReward}
                    onChange={(v) =>
                      setRuleForm({ ...ruleForm, maixuReward: v })
                    }
                  />
                </div>
                <button
                  onClick={handleSaveRules}
                  disabled={savingRules}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                >
                  {savingRules ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Save size={16} />
                  )}
                  {savingRules ? '保存中...' : '保存规则'}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* 右栏：账户管理 */}
        {canManageAccounts && (
          <motion.div
            className="bg-card border border-border rounded-xl p-5"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
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
                    <th className="px-3 py-2 font-medium">分部</th>
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
        )}
      </div>

      {/* 分部管理（仅会长） */}
      {isHuizhang && (
        <motion.div
          className="bg-card border border-border rounded-xl p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-primary" />
              <h3 className="text-base font-semibold text-textPrimary">
                分部管理
              </h3>
            </div>
            <button
              onClick={() => setBranchModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <Plus size={16} />
              添加分部
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-textSecondary">
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">人员数</th>
                  <th className="px-4 py-3 font-medium">数据数</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {branchesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : branches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-textMuted"
                    >
                      暂无分部
                    </td>
                  </tr>
                ) : (
                  branches.map((b) => {
                    const hasData = (b.dataRecordCount ?? 0) > 0
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                      >
                        <td className="px-4 py-3 text-textPrimary font-medium">
                          {b.name}
                        </td>
                        <td className="px-4 py-3 text-textSecondary font-mono">
                          {b.personnelCount ?? 0}
                        </td>
                        <td className="px-4 py-3 text-textSecondary font-mono">
                          {b.dataRecordCount ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteBranch(b)}
                            disabled={hasData}
                            className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                            title={
                              hasData
                                ? '存在数据记录，无法删除'
                                : '删除分部'
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* 通知列表（所有角色） */}
      <motion.div
        className="bg-card border border-border rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-primary" />
          <h3 className="text-base font-semibold text-textPrimary">通知列表</h3>
        </div>
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-textMuted">
            暂无通知
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 20).map((n) => {
              const Icon = notificationIcon(n.type)
              return (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n.id)}
                  className={`flex items-start gap-3 w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-surface hover:border-primary/50 transition-colors duration-200 cursor-pointer ${
                    !n.isRead ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="mt-0.5">
                    <Icon size={18} className="text-textSecondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-textPrimary">
                        {n.content}
                      </span>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-textMuted mt-1">
                      {formatDateTime(n.createdAt)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
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
              {isHuizhang && <option value="CHAOGUAN">超管</option>}
              <option value="GUANLI">管理</option>
            </select>
          </div>

          {/* 所属分部 */}
          {isHuizhang && (
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                所属分部
              </label>
              <select
                value={accountForm.branchId}
                onChange={(e) =>
                  setAccountForm({ ...accountForm, branchId: e.target.value })
                }
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              >
                <option value="">请选择分部</option>
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

      {/* 添加分部弹窗 */}
      <Modal
        open={branchModalOpen}
        title="添加分部"
        onClose={() => setBranchModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setBranchModalOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleAddBranch}
              disabled={branchSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {branchSubmitting && <Spinner className="h-4 w-4" />}
              {branchSubmitting ? '创建中...' : '创建'}
            </button>
          </>
        }
      >
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            分部名称
          </label>
          <input
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="请输入分部名称"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
          />
        </div>
      </Modal>
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <div>
      <label className="block text-xs text-textSecondary mb-1">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          // 允许清空（undefined），否则转换为数字
          onChange(v === '' ? undefined : Number(v))
        }}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
      />
    </div>
  )
}
