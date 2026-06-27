import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, Plus, Trash2, Pencil, Gift, Crown } from 'lucide-react'
import {
  branchesApi,
  rewardRulesApi,
  namingLevelsApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Modal from '../../components/Modal'
import { Skeleton, Spinner } from '../../components/Skeleton'
import SubPageHeader from '../../components/SubPageHeader'
import type {
  Branch,
  RewardRule,
  UpdateRewardRuleInput,
  NamingLevel,
} from '../../types'

// 奖励规则表单结构
type RuleForm = {
  sgRatio: number
  qmRatio: number
  rank1Reward: number
  rank2Reward: number
  rank3Reward: number
  maixuThreshold: number
  maixuReward: number
  maixuMinStandard: number
  sgEnabled: boolean
  qmEnabled: boolean
  rankEnabled: boolean
  maixuEnabled: boolean
  maixuMinEnabled: boolean
  stackRankAndMaixu: boolean
}

const defaultRuleForm: RuleForm = {
  sgRatio: 3,
  qmRatio: 3,
  rank1Reward: 100,
  rank2Reward: 80,
  rank3Reward: 60,
  maixuThreshold: 40,
  maixuReward: 52,
  maixuMinStandard: 0,
  sgEnabled: true,
  qmEnabled: true,
  rankEnabled: true,
  maixuEnabled: true,
  maixuMinEnabled: false,
  stackRankAndMaixu: true,
}

// 开关行：左侧标签 + 右侧 toggle
function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div>
        <div className="text-sm text-textPrimary">{label}</div>
        <div className="text-xs text-textMuted mt-0.5">{desc}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs text-textSecondary mb-1">{label}</label>
      <input
        type="number"
        value={value ? value : ''}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? 0 : Number(v))
        }}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  )
}

export default function BranchesPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canManage = isHuizhang || isChaoguan

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)

  // 厅编辑弹窗（名称 + 统计周期）
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branchName, setBranchName] = useState('')
  const [branchCycle, setBranchCycle] = useState<'WEEK' | 'MONTH'>('WEEK')
  const [branchSubmitting, setBranchSubmitting] = useState(false)

  // 删除厅确认弹窗（需输入登录密码）
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  // 奖励规则弹窗
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [ruleBranch, setRuleBranch] = useState<Branch | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleForm>(defaultRuleForm)
  const [ruleLoading, setRuleLoading] = useState(false)
  const [ruleSaving, setRuleSaving] = useState(false)

  // 冠名等级弹窗
  const [namingModalOpen, setNamingModalOpen] = useState(false)
  const [namingBranch, setNamingBranch] = useState<Branch | null>(null)
  const [namingLevels, setNamingLevels] = useState<NamingLevel[]>([])
  const [namingLoading, setNamingLoading] = useState(false)
  // 新增/编辑表单：editingId 为 null 表示新增模式
  const [namingFormId, setNamingFormId] = useState<number | null>(null)
  const [namingForm, setNamingForm] = useState({
    name: '',
    threshold: 0,
    reward: 0,
  })
  const [namingSubmitting, setNamingSubmitting] = useState(false)

  const loadBranches = async () => {
    setBranchesLoading(true)
    try {
      const list = await branchesApi.list()
      setBranches(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBranchesLoading(false)
    }
  }

  useEffect(() => {
    if (canManage) {
      loadBranches()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  const openAddBranchModal = () => {
    setEditingBranch(null)
    setBranchName('')
    setBranchCycle('WEEK')
    setBranchModalOpen(true)
  }

  const openEditBranchModal = (branch: Branch) => {
    setEditingBranch(branch)
    setBranchName(branch.name)
    setBranchCycle(branch.statCycle ?? 'WEEK')
    setBranchModalOpen(true)
  }

  const handleBranchSubmit = async () => {
    if (!branchName.trim()) {
      toast.error('请输入厅名称')
      return
    }
    setBranchSubmitting(true)
    try {
      if (editingBranch) {
        await branchesApi.update(editingBranch.id, {
          name: branchName.trim(),
          statCycle: branchCycle,
        })
        toast.success('厅更新成功')
      } else {
        await branchesApi.create(branchName.trim(), branchCycle)
        toast.success('厅创建成功')
      }
      setBranchModalOpen(false)
      await loadBranches()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBranchSubmitting(false)
    }
  }

  // 打开删除确认弹窗
  const openDeleteModal = (branch: Branch) => {
    setDeleteTarget(branch)
    setDeletePassword('')
    setDeleteModalOpen(true)
  }

  // 确认删除厅（携带登录密码）
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    if (!deletePassword) {
      toast.error('请输入登录密码')
      return
    }
    setDeleting(true)
    try {
      await branchesApi.delete(deleteTarget.id, deletePassword)
      toast.success('厅及关联数据已删除')
      setDeleteModalOpen(false)
      setDeleteTarget(null)
      setDeletePassword('')
      await loadBranches()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // 打开奖励规则弹窗
  const openRuleModal = async (branch: Branch) => {
    setRuleBranch(branch)
    setRuleForm(defaultRuleForm)
    setRuleModalOpen(true)
    setRuleLoading(true)
    try {
      const rules = await rewardRulesApi.get(branch.id)
      const r: RewardRule | undefined = rules[0]
      if (r) {
        setRuleForm({
          sgRatio: r.sgRatio,
          qmRatio: r.qmRatio,
          rank1Reward: r.rank1Reward,
          rank2Reward: r.rank2Reward,
          rank3Reward: r.rank3Reward,
          maixuThreshold: r.maixuThreshold,
          maixuReward: r.maixuReward,
          maixuMinStandard: r.maixuMinStandard,
          sgEnabled: r.sgEnabled,
          qmEnabled: r.qmEnabled,
          rankEnabled: r.rankEnabled,
          maixuEnabled: r.maixuEnabled,
          maixuMinEnabled: r.maixuMinEnabled,
          stackRankAndMaixu: r.stackRankAndMaixu,
        })
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRuleLoading(false)
    }
  }

  const handleRuleSave = async () => {
    if (!ruleBranch) return
    const payload: UpdateRewardRuleInput = { ...ruleForm }
    setRuleSaving(true)
    try {
      await rewardRulesApi.update(ruleBranch.id, payload)
      toast.success('奖励规则保存成功')
      setRuleModalOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRuleSaving(false)
    }
  }

  // 打开冠名等级弹窗
  const openNamingModal = async (branch: Branch) => {
    setNamingBranch(branch)
    setNamingFormId(null)
    setNamingForm({ name: '', threshold: 0, reward: 0 })
    setNamingLevels([])
    setNamingModalOpen(true)
    setNamingLoading(true)
    try {
      const list = await namingLevelsApi.get(branch.id)
      // 按 threshold 降序展示（高等级优先）
      list.sort((a, b) => b.threshold - a.threshold)
      setNamingLevels(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setNamingLoading(false)
    }
  }

  // 重置冠名等级表单
  const resetNamingForm = () => {
    setNamingFormId(null)
    setNamingForm({ name: '', threshold: 0, reward: 0 })
  }

  // 编辑某等级：载入到表单
  const handleEditNaming = (level: NamingLevel) => {
    setNamingFormId(level.id)
    setNamingForm({
      name: level.name,
      threshold: level.threshold,
      reward: level.reward,
    })
  }

  // 提交新增/编辑
  const handleNamingSubmit = async () => {
    if (!namingBranch) return
    if (!namingForm.name.trim()) {
      toast.error('请输入等级名称')
      return
    }
    if (
      !Number.isInteger(namingForm.threshold) ||
      namingForm.threshold <= 0
    ) {
      toast.error('阈值必须为正整数')
      return
    }
    setNamingSubmitting(true)
    try {
      if (namingFormId) {
        await namingLevelsApi.update(namingFormId, {
          name: namingForm.name.trim(),
          threshold: namingForm.threshold,
          reward: namingForm.reward,
        })
        toast.success('等级更新成功')
      } else {
        await namingLevelsApi.create({
          branchId: namingBranch.id,
          name: namingForm.name.trim(),
          threshold: namingForm.threshold,
          reward: namingForm.reward,
        })
        toast.success('等级创建成功')
      }
      resetNamingForm()
      // 重新拉取列表
      const list = await namingLevelsApi.get(namingBranch.id)
      list.sort((a, b) => b.threshold - a.threshold)
      setNamingLevels(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setNamingSubmitting(false)
    }
  }

  // 删除等级
  const handleDeleteNaming = async (level: NamingLevel) => {
    if (!namingBranch) return
    if (!window.confirm(`确认删除冠名等级「${level.name}」？`)) return
    try {
      await namingLevelsApi.remove(level.id)
      toast.success('删除成功')
      // 若删除的项正在编辑，重置表单
      if (namingFormId === level.id) resetNamingForm()
      const list = await namingLevelsApi.get(namingBranch.id)
      list.sort((a, b) => b.threshold - a.threshold)
      setNamingLevels(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  if (!canManage) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="厅管理"
        desc="管理厅信息、统计周期与奖励规则"
      />
      <motion.div
        className="bg-card border border-border rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              厅管理
            </h3>
          </div>
          {isHuizhang && (
            <button
              onClick={openAddBranchModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
            >
              <Plus size={16} />
              添加厅
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">统计周期</th>
                <th className="px-4 py-3 font-medium">人员数</th>
                <th className="px-4 py-3 font-medium">数据数</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {branchesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : branches.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-textMuted"
                  >
                    暂无厅
                  </td>
                </tr>
              ) : (
                branches.map((b) => {
                  return (
                    <tr
                      key={b.id}
                      className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                    >
                      <td className="px-4 py-3 text-textPrimary font-medium">
                        {b.name}
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-surface border border-border">
                          {b.statCycle === 'MONTH' ? '按月' : '按周'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textSecondary font-mono">
                        {b.personnelCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-textSecondary font-mono">
                        {b.dataRecordCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openRuleModal(b)}
                            className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                            title="奖励规则"
                          >
                            <Gift size={16} />
                          </button>
                          {b.statCycle === 'MONTH' && (
                            <button
                              onClick={() => openNamingModal(b)}
                              className="p-1.5 text-textSecondary hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors duration-200 cursor-pointer"
                              title="冠名等级"
                            >
                              <Crown size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditBranchModal(b)}
                            className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                            title="编辑厅"
                          >
                            <Pencil size={16} />
                          </button>
                          {isHuizhang && (
                            <button
                              onClick={() => openDeleteModal(b)}
                              className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                              title="删除厅"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* 添加/编辑厅弹窗 */}
      <Modal
        open={branchModalOpen}
        title={editingBranch ? '编辑厅' : '添加厅'}
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
              onClick={handleBranchSubmit}
              disabled={branchSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {branchSubmitting && <Spinner className="h-4 w-4" />}
              {branchSubmitting
                ? editingBranch
                  ? '保存中...'
                  : '创建中...'
                : editingBranch
                  ? '保存'
                  : '创建'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              厅名称
            </label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="请输入厅名称"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-2">
              统计周期
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['WEEK', 'MONTH'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBranchCycle(c)}
                  className={`px-4 py-2.5 rounded-lg text-sm border transition-colors duration-200 cursor-pointer ${
                    branchCycle === c
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-card text-textSecondary hover:border-primary'
                  }`}
                >
                  {c === 'MONTH' ? '按月统计' : '按周统计'}
                </button>
              ))}
            </div>
            <p className="text-xs text-textMuted mt-2">
              按月统计时，排名与看板按月汇总各周数据
            </p>
          </div>
        </div>
      </Modal>

      {/* 奖励规则弹窗 */}
      <Modal
        open={ruleModalOpen}
        title={`奖励规则 - ${ruleBranch?.name ?? ''}`}
        onClose={() => setRuleModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setRuleModalOpen(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleRuleSave}
              disabled={ruleSaving || ruleLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {ruleSaving ? <Spinner className="h-4 w-4" /> : <Gift size={16} />}
              {ruleSaving ? '保存中...' : '保存规则'}
            </button>
          </>
        }
      >
        {ruleLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* 麦序最低标准开关 + 数值（全局门控：未达标不计任何福利） */}
            <div>
              <ToggleRow
                label="麦序最低标准"
                desc="启用后麦序未达到此值则不计任何福利（基础福利与排名奖励均置0）"
                checked={ruleForm.maixuMinEnabled}
                onChange={(v) =>
                  setRuleForm({ ...ruleForm, maixuMinEnabled: v })
                }
              />
              <div className="mt-2">
                <NumberInput
                  label="麦序最低标准值"
                  value={ruleForm.maixuMinStandard}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, maixuMinStandard: v })
                  }
                  disabled={!ruleForm.maixuMinEnabled}
                />
              </div>
            </div>

            {/* 收光转换开关 + 数值 */}
            <div>
              <ToggleRow
                label="收光转换"
                desc="收光 × 收光比例 计入基础福利"
                checked={ruleForm.sgEnabled}
                onChange={(v) => setRuleForm({ ...ruleForm, sgEnabled: v })}
              />
              <div className="mt-2">
                <NumberInput
                  label="收光转换比例"
                  value={ruleForm.sgRatio}
                  onChange={(v) => setRuleForm({ ...ruleForm, sgRatio: v })}
                  disabled={!ruleForm.sgEnabled}
                />
              </div>
            </div>

            {/* 全麦转换开关 + 数值 */}
            <div>
              <ToggleRow
                label="全麦转换"
                desc="全麦 × 全麦比例 计入基础福利"
                checked={ruleForm.qmEnabled}
                onChange={(v) => setRuleForm({ ...ruleForm, qmEnabled: v })}
              />
              <div className="mt-2">
                <NumberInput
                  label="全麦转换比例"
                  value={ruleForm.qmRatio}
                  onChange={(v) => setRuleForm({ ...ruleForm, qmRatio: v })}
                  disabled={!ruleForm.qmEnabled}
                />
              </div>
            </div>

            {/* 排名奖励开关 + 数值 */}
            <div>
              <ToggleRow
                label="排名奖励"
                desc="前3名分别获得对应奖励"
                checked={ruleForm.rankEnabled}
                onChange={(v) => setRuleForm({ ...ruleForm, rankEnabled: v })}
              />
              <div className="grid grid-cols-3 gap-3 mt-2">
                <NumberInput
                  label="第1名"
                  value={ruleForm.rank1Reward}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, rank1Reward: v })
                  }
                  disabled={!ruleForm.rankEnabled}
                />
                <NumberInput
                  label="第2名"
                  value={ruleForm.rank2Reward}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, rank2Reward: v })
                  }
                  disabled={!ruleForm.rankEnabled}
                />
                <NumberInput
                  label="第3名"
                  value={ruleForm.rank3Reward}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, rank3Reward: v })
                  }
                  disabled={!ruleForm.rankEnabled}
                />
              </div>
            </div>

            {/* 麦序达标奖励开关 + 数值 */}
            <div>
              <ToggleRow
                label="麦序达标奖励"
                desc="未进前3但麦序达标者获得奖励"
                checked={ruleForm.maixuEnabled}
                onChange={(v) =>
                  setRuleForm({ ...ruleForm, maixuEnabled: v })
                }
              />
              <div className="grid grid-cols-2 gap-3 mt-2">
                <NumberInput
                  label="麦序达标阈值"
                  value={ruleForm.maixuThreshold}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, maixuThreshold: v })
                  }
                  disabled={!ruleForm.maixuEnabled}
                />
                <NumberInput
                  label="麦序达标奖励"
                  value={ruleForm.maixuReward}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, maixuReward: v })
                  }
                  disabled={!ruleForm.maixuEnabled}
                />
              </div>
            </div>

            {/* 排名奖金与麦序达标奖励叠加开关 */}
            <ToggleRow
              label="排名奖金与麦序达标奖励叠加"
              desc="开启：前3名达标时同时获得排名奖金与麦序达标奖励；关闭：前3名只拿排名奖金，不叠加麦序达标奖励"
              checked={ruleForm.stackRankAndMaixu}
              onChange={(v) =>
                setRuleForm({ ...ruleForm, stackRankAndMaixu: v })
              }
            />
          </div>
        )}
      </Modal>

      {/* 冠名等级弹窗 */}
      <Modal
        open={namingModalOpen}
        title={`冠名等级 - ${namingBranch?.name ?? ''}`}
        onClose={() => setNamingModalOpen(false)}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-textMuted leading-relaxed">
            仅按月统计厅支持冠名。录入收光时按阈值整除转换为冠名（逐级扣减，高等级优先），余数计入收光。冠名数 × 等级福利累加到总福利。等级数量可调，等级名称可自定义。
          </p>

          {/* 等级列表 */}
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-textSecondary">
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">阈值(收光)</th>
                  <th className="px-3 py-2 font-medium">福利</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {namingLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="px-3 py-2">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : namingLevels.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-textMuted"
                    >
                      暂无冠名等级，请在下方新增
                    </td>
                  </tr>
                ) : (
                  namingLevels.map((level) => (
                    <tr
                      key={level.id}
                      className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                        namingFormId === level.id ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-textPrimary font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Crown size={13} className="text-amber-500" />
                          {level.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-textPrimary font-mono">
                        {level.threshold}
                      </td>
                      <td className="px-3 py-2 text-textPrimary font-mono">
                        {level.reward}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditNaming(level)}
                            className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                            title="编辑"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteNaming(level)}
                            className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 新增/编辑表单 */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus size={16} className="text-primary" />
              <h4 className="text-sm font-semibold text-textPrimary">
                {namingFormId ? '编辑等级' : '新增等级'}
              </h4>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-textSecondary mb-1">
                  等级名称
                </label>
                <input
                  type="text"
                  value={namingForm.name}
                  onChange={(e) =>
                    setNamingForm({ ...namingForm, name: e.target.value })
                  }
                  placeholder="如：周冠、月冠"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">
                  阈值(收光)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={namingForm.threshold ? namingForm.threshold : ''}
                  onChange={(e) =>
                    setNamingForm({
                      ...namingForm,
                      threshold: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  placeholder="如：100"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">
                  等级福利
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={namingForm.reward ? namingForm.reward : ''}
                  onChange={(e) =>
                    setNamingForm({
                      ...namingForm,
                      reward: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  placeholder="如：50"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleNamingSubmit}
                disabled={namingSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {namingSubmitting ? <Spinner className="h-4 w-4" /> : <Plus size={16} />}
                {namingFormId ? '保存修改' : '添加等级'}
              </button>
              {namingFormId && (
                <button
                  onClick={resetNamingForm}
                  className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
                >
                  取消编辑
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* 删除厅确认弹窗（需输入登录密码） */}
      <Modal
        open={deleteModalOpen}
        title="删除厅确认"
        onClose={() => {
          setDeleteModalOpen(false)
          setDeleteTarget(null)
          setDeletePassword('')
        }}
        footer={
          <>
            <button
              onClick={() => {
                setDeleteModalOpen(false)
                setDeleteTarget(null)
                setDeletePassword('')
              }}
              disabled={deleting}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleting || !deletePassword}
              className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {deleting ? <Spinner className="h-4 w-4" /> : <Trash2 size={16} />}
              {deleting ? '删除中...' : '确认删除'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger font-medium">
              危险操作：删除厅「{deleteTarget?.name}」
            </p>
            <p className="text-xs text-textSecondary mt-1 leading-relaxed">
              删除后，该厅下的所有数据记录、人员（仅属于该厅的）、奖励规则、冠名等级、通知等将被永久删除，且无法恢复。
              请谨慎操作。
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
                  handleConfirmDelete()
                }
              }}
              placeholder="登录密码"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
