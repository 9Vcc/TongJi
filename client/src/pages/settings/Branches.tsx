import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  Plus,
  Trash2,
  Pencil,
  Gift,
  Crown,
  Power,
  GitMerge,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  X,
  Clock,
} from 'lucide-react'
import {
  branchesApi,
  branchGroupsApi,
  rewardRulesApi,
  namingLevelsApi,
  timeSlotMultipliersApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Modal from '../../components/Modal'
import { Skeleton, Spinner } from '../../components/Skeleton'
import GroupedSelect from '../../components/GroupedSelect'
import SubPageHeader from '../../components/SubPageHeader'
import type {
  Branch,
  BranchGroup,
  RewardRule,
  UpdateRewardRuleInput,
  NamingLevel,
} from '../../types'

// 时间段数量（0-2、2-4、...、22-24，共12个）
const SLOT_COUNT = 12
// 生成时间段标签：'0-2'、'2-4'、...、'22-24'
const SLOT_LABELS = Array.from(
  { length: SLOT_COUNT },
  (_, i) => `${i * 2}-${i * 2 + 2}`,
)

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
  zcEnabled: boolean
  zcDayReward: number
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
  zcEnabled: false,
  zcDayReward: 0,
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
        className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
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

  // 关闭/开启厅
  const [toggleTarget, setToggleTarget] = useState<Branch | null>(null)
  const [toggling, setToggling] = useState(false)

  // 奖励规则弹窗
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [ruleBranch, setRuleBranch] = useState<Branch | null>(null)
  // 合厅组合并管理：ruleGroup 有值时保存批量应用到所有成员厅
  const [ruleGroup, setRuleGroup] = useState<BranchGroup | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleForm>(defaultRuleForm)
  const [ruleLoading, setRuleLoading] = useState(false)
  const [ruleSaving, setRuleSaving] = useState(false)

  // 冠名等级弹窗
  const [namingModalOpen, setNamingModalOpen] = useState(false)
  const [namingBranch, setNamingBranch] = useState<Branch | null>(null)
  // 合厅组合并管理：namingGroup 有值时保存批量应用到所有成员厅
  const [namingGroup, setNamingGroup] = useState<BranchGroup | null>(null)
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

  // 时间段倍率弹窗
  const [slotModalOpen, setSlotModalOpen] = useState(false)
  const [slotBranch, setSlotBranch] = useState<Branch | null>(null)
  // 合厅组模式：批量设置所有成员厅的倍率
  const [slotGroup, setSlotGroup] = useState<BranchGroup | null>(null)
  // 12 个时间段的倍率数组（索引对齐 slotIndex）
  const [slotMultipliers, setSlotMultipliers] = useState<number[]>(
    Array(SLOT_COUNT).fill(1),
  )
  // 时间段倍率功能开关（存储在 RewardRule.mxSlotEnabled）
  const [slotEnabled, setSlotEnabled] = useState(false)
  const [slotLoading, setSlotLoading] = useState(false)
  const [slotSaving, setSlotSaving] = useState(false)

  // ============ 合厅组管理状态 ============
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  // 厅多选（仅会长可操作）
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<number>>(
    new Set(),
  )
  // 折叠的合厅组卡片
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(
    new Set(),
  )

  // 创建合厅组弹窗
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

  // 重命名合厅组弹窗
  const [renameGroupTarget, setRenameGroupTarget] =
    useState<BranchGroup | null>(null)
  const [renameGroupName, setRenameGroupName] = useState('')
  const [renamingGroup, setRenamingGroup] = useState(false)

  // 解散合厅组确认弹窗
  const [dissolveGroupTarget, setDissolveGroupTarget] =
    useState<BranchGroup | null>(null)
  const [dissolvingGroup, setDissolvingGroup] = useState(false)

  // 添加厅到合厅组弹窗
  const [addBranchTarget, setAddBranchTarget] =
    useState<BranchGroup | null>(null)
  const [addBranchId, setAddBranchId] = useState<number | null>(null)
  const [addingBranch, setAddingBranch] = useState(false)

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

  const loadBranchGroups = async () => {
    setGroupsLoading(true)
    try {
      const list = await branchGroupsApi.list()
      setBranchGroups(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setGroupsLoading(false)
    }
  }

  // 合厅操作后刷新厅与合厅组列表（两者均需刷新以同步 groupId）
  const reloadAll = async () => {
    await Promise.all([loadBranches(), loadBranchGroups()])
  }

  useEffect(() => {
    if (canManage) {
      loadBranches()
      // 合厅组管理仅会长可见，仅会长时加载
      if (isHuizhang) {
        loadBranchGroups()
      }
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

  // 打开关闭/开启确认弹窗
  const openToggleModal = (branch: Branch) => {
    setToggleTarget(branch)
  }

  // 确认关闭/开启厅
  const handleConfirmToggle = async () => {
    if (!toggleTarget) return
    setToggling(true)
    try {
      const result = await branchesApi.toggleClose(toggleTarget.id)
      toast.success(result.closed ? '厅已关闭' : '厅已开启')
      setToggleTarget(null)
      await loadBranches()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setToggling(false)
    }
  }

  // 打开奖励规则弹窗（单厅）
  const openRuleModal = async (branch: Branch) => {
    setRuleBranch(branch)
    setRuleGroup(null)
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
          zcEnabled: r.zcEnabled,
          zcDayReward: r.zcDayReward,
        })
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRuleLoading(false)
    }
  }

  // 打开奖励规则弹窗（合厅组）：以首个成员厅配置为初始值，保存时批量应用
  const openRuleModalForGroup = async (group: BranchGroup) => {
    const memberBranches = group.branches.filter((b) => !b.closed)
    if (memberBranches.length === 0) {
      toast.error('该合厅组没有可用的成员厅')
      return
    }
    setRuleBranch(null)
    setRuleGroup(group)
    setRuleForm(defaultRuleForm)
    setRuleModalOpen(true)
    setRuleLoading(true)
    try {
      const firstBranch = memberBranches[0]
      const rules = await rewardRulesApi.get(firstBranch.id)
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
          zcEnabled: r.zcEnabled,
          zcDayReward: r.zcDayReward,
        })
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRuleLoading(false)
    }
  }

  const handleRuleSave = async () => {
    if (!ruleBranch && !ruleGroup) return
    const payload: UpdateRewardRuleInput = { ...ruleForm }
    setRuleSaving(true)
    try {
      if (ruleGroup) {
        // 合厅组模式：批量更新所有成员厅
        const memberBranches = ruleGroup.branches.filter((b) => !b.closed)
        await Promise.all(
          memberBranches.map((b) => rewardRulesApi.update(b.id, payload)),
        )
        toast.success(`已应用到 ${memberBranches.length} 个成员厅`)
      } else if (ruleBranch) {
        await rewardRulesApi.update(ruleBranch.id, payload)
        toast.success('奖励规则保存成功')
      }
      setRuleModalOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRuleSaving(false)
    }
  }

  // 打开冠名等级弹窗（单厅）
  const openNamingModal = async (branch: Branch) => {
    setNamingBranch(branch)
    setNamingGroup(null)
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

  // 打开冠名等级弹窗（合厅组）：以首个成员厅配置为初始值
  const openNamingModalForGroup = async (group: BranchGroup) => {
    const memberBranches = group.branches.filter((b) => !b.closed)
    if (memberBranches.length === 0) {
      toast.error('该合厅组没有可用的成员厅')
      return
    }
    setNamingBranch(null)
    setNamingGroup(group)
    setNamingFormId(null)
    setNamingForm({ name: '', threshold: 0, reward: 0 })
    setNamingLevels([])
    setNamingModalOpen(true)
    setNamingLoading(true)
    try {
      const firstBranch = memberBranches[0]
      const list = await namingLevelsApi.get(firstBranch.id)
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
    if (!namingBranch && !namingGroup) return
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
      if (namingGroup) {
        // 合厅组模式：按名称匹配，批量更新或创建到所有成员厅
        const memberBranches = namingGroup.branches.filter((b) => !b.closed)
        // 收集所有成员厅的等级列表
        const allLists = await Promise.all(
          memberBranches.map((b) => namingLevelsApi.get(b.id)),
        )
        if (namingFormId) {
          // 编辑：按名称在所有成员厅中找对应等级并更新
          const originalLevel = namingLevels.find((l) => l.id === namingFormId)
          const matchName = originalLevel?.name ?? namingForm.name.trim()
          await Promise.all(
            memberBranches.map(async (_, idx) => {
              const matched = allLists[idx].find((l) => l.name === matchName)
              if (matched) {
                await namingLevelsApi.update(matched.id, {
                  name: namingForm.name.trim(),
                  threshold: namingForm.threshold,
                  reward: namingForm.reward,
                })
              }
            }),
          )
          toast.success(`已同步到 ${memberBranches.length} 个成员厅`)
        } else {
          // 新增：为所有成员厅创建
          await Promise.all(
            memberBranches.map((b) =>
              namingLevelsApi.create({
                branchId: b.id,
                name: namingForm.name.trim(),
                threshold: namingForm.threshold,
                reward: namingForm.reward,
              }),
            ),
          )
          toast.success(`已创建到 ${memberBranches.length} 个成员厅`)
        }
      } else if (namingBranch) {
        // 单厅模式
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
      }
      resetNamingForm()
      // 重新拉取列表（合厅组取首个成员厅）
      const targetBranchId = namingGroup
        ? namingGroup.branches.filter((b) => !b.closed)[0]?.id
        : namingBranch?.id
      if (targetBranchId) {
        const list = await namingLevelsApi.get(targetBranchId)
        list.sort((a, b) => b.threshold - a.threshold)
        setNamingLevels(list)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setNamingSubmitting(false)
    }
  }

  // 删除等级
  const handleDeleteNaming = async (level: NamingLevel) => {
    if (!namingBranch && !namingGroup) return
    if (!window.confirm(`确认删除冠名等级「${level.name}」？`)) return
    try {
      if (namingGroup) {
        // 合厅组模式：按名称匹配，批量删除所有成员厅的对应等级
        const memberBranches = namingGroup.branches.filter((b) => !b.closed)
        const allLists = await Promise.all(
          memberBranches.map((b) => namingLevelsApi.get(b.id)),
        )
        await Promise.all(
          memberBranches.map(async (_, idx) => {
            const matched = allLists[idx].find((l) => l.name === level.name)
            if (matched) {
              await namingLevelsApi.remove(matched.id)
            }
          }),
        )
        toast.success(`已从 ${memberBranches.length} 个成员厅删除`)
      } else {
        await namingLevelsApi.remove(level.id)
        toast.success('删除成功')
      }
      // 若删除的项正在编辑，重置表单
      if (namingFormId === level.id) resetNamingForm()
      // 重新拉取列表
      const targetBranchId = namingGroup
        ? namingGroup.branches.filter((b) => !b.closed)[0]?.id
        : namingBranch?.id
      if (targetBranchId) {
        const list = await namingLevelsApi.get(targetBranchId)
        list.sort((a, b) => b.threshold - a.threshold)
        setNamingLevels(list)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 打开时间段倍率弹窗（单厅）：并行加载奖励规则（mxSlotEnabled）和12个时间段倍率
  const openSlotModal = async (branch: Branch) => {
    setSlotBranch(branch)
    setSlotGroup(null)
    setSlotMultipliers(Array(SLOT_COUNT).fill(1))
    setSlotEnabled(false)
    setSlotModalOpen(true)
    setSlotLoading(true)
    try {
      const [rules, multipliers] = await Promise.all([
        rewardRulesApi.get(branch.id),
        timeSlotMultipliersApi.get(branch.id),
      ])
      const r = rules[0]
      if (r) setSlotEnabled(r.mxSlotEnabled)
      // 填充12个倍率，缺失的默认为1
      const arr = Array(SLOT_COUNT).fill(1)
      for (const m of multipliers) {
        if (m.slotIndex >= 0 && m.slotIndex < SLOT_COUNT) {
          arr[m.slotIndex] = m.multiplier
        }
      }
      setSlotMultipliers(arr)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSlotLoading(false)
    }
  }

  // 打开时间段倍率弹窗（合厅组）：以第一个成员厅的配置为初始值，保存时批量应用到所有成员厅
  const openSlotModalForGroup = async (group: BranchGroup) => {
    const memberBranches = group.branches.filter((b) => !b.closed)
    if (memberBranches.length === 0) {
      toast.error('该合厅组没有可用的成员厅')
      return
    }
    setSlotBranch(null)
    setSlotGroup(group)
    setSlotMultipliers(Array(SLOT_COUNT).fill(1))
    setSlotEnabled(false)
    setSlotModalOpen(true)
    setSlotLoading(true)
    try {
      // 以第一个成员厅的配置作为初始值
      const firstBranch = memberBranches[0]
      const [rules, multipliers] = await Promise.all([
        rewardRulesApi.get(firstBranch.id),
        timeSlotMultipliersApi.get(firstBranch.id),
      ])
      const r = rules[0]
      if (r) setSlotEnabled(r.mxSlotEnabled)
      const arr = Array(SLOT_COUNT).fill(1)
      for (const m of multipliers) {
        if (m.slotIndex >= 0 && m.slotIndex < SLOT_COUNT) {
          arr[m.slotIndex] = m.multiplier
        }
      }
      setSlotMultipliers(arr)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSlotLoading(false)
    }
  }

  // 保存时间段倍率：单厅更新一个，合厅组批量更新所有成员厅
  const handleSlotSave = async () => {
    if (!slotBranch && !slotGroup) return
    setSlotSaving(true)
    try {
      if (slotGroup) {
        // 合厅组模式：批量更新所有成员厅的倍率和开关
        const memberBranches = slotGroup.branches.filter((b) => !b.closed)
        const multiplierPayload = slotMultipliers.map((multiplier, slotIndex) => ({
          slotIndex,
          multiplier,
        }))
        await Promise.all(
          memberBranches.flatMap((b) => [
            rewardRulesApi.update(b.id, { mxSlotEnabled: slotEnabled }),
            timeSlotMultipliersApi.update(b.id, multiplierPayload),
          ]),
        )
        toast.success(`已应用到 ${memberBranches.length} 个成员厅`)
      } else if (slotBranch) {
        // 单厅模式
        await Promise.all([
          rewardRulesApi.update(slotBranch.id, { mxSlotEnabled: slotEnabled }),
          timeSlotMultipliersApi.update(
            slotBranch.id,
            slotMultipliers.map((multiplier, slotIndex) => ({
              slotIndex,
              multiplier,
            })),
          ),
        ])
        toast.success('时间段倍率保存成功')
      }
      setSlotModalOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSlotSaving(false)
    }
  }

  // ============ 合厅组管理 ============

  // 切换厅选中状态
  const toggleBranchSelect = (id: number) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // 全选 / 取消全选（仅未分组的厅）
  const toggleSelectAll = () => {
    setSelectedBranchIds((prev) => {
      const ungroupedIds = branches.filter((b) => !groupedBranchIds.has(b.id)).map((b) => b.id)
      if (ungroupedIds.length > 0 && ungroupedIds.every((id) => prev.has(id))) {
        // 已全选未分组厅：取消全选
        const next = new Set(prev)
        ungroupedIds.forEach((id) => next.delete(id))
        return next
      }
      // 未全选：全选未分组厅
      const next = new Set(prev)
      ungroupedIds.forEach((id) => next.add(id))
      return next
    })
  }

  // 清空选择
  const clearSelection = () => setSelectedBranchIds(new Set())

  // 打开创建合厅组弹窗
  const openCreateGroupModal = () => {
    if (selectedBranchIds.size < 2) {
      toast.error('请至少选择 2 个厅')
      return
    }
    setNewGroupName('')
    setCreateGroupModalOpen(true)
  }

  // 确认创建合厅组
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error('请输入合厅组名称')
      return
    }
    setCreatingGroup(true)
    try {
      await branchGroupsApi.create({
        name: newGroupName.trim(),
        branchIds: Array.from(selectedBranchIds),
      })
      toast.success('合厅组创建成功')
      setCreateGroupModalOpen(false)
      setNewGroupName('')
      clearSelection()
      await reloadAll()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setCreatingGroup(false)
    }
  }

  // 打开重命名弹窗
  const openRenameGroupModal = (group: BranchGroup) => {
    setRenameGroupTarget(group)
    setRenameGroupName(group.name)
  }

  // 确认重命名
  const handleRenameGroup = async () => {
    if (!renameGroupTarget) return
    if (!renameGroupName.trim()) {
      toast.error('请输入合厅组名称')
      return
    }
    setRenamingGroup(true)
    try {
      await branchGroupsApi.rename(renameGroupTarget.id, renameGroupName.trim())
      toast.success('重命名成功')
      setRenameGroupTarget(null)
      setRenameGroupName('')
      await loadBranchGroups()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRenamingGroup(false)
    }
  }

  // 打开解散确认弹窗
  const openDissolveGroupModal = (group: BranchGroup) => {
    setDissolveGroupTarget(group)
  }

  // 确认解散合厅组
  const handleDissolveGroup = async () => {
    if (!dissolveGroupTarget) return
    setDissolvingGroup(true)
    try {
      await branchGroupsApi.dissolve(dissolveGroupTarget.id)
      toast.success('合厅组已解散')
      setDissolveGroupTarget(null)
      await reloadAll()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDissolvingGroup(false)
    }
  }

  // 打开添加厅到合厅组弹窗
  const openAddBranchToGroupModal = (group: BranchGroup) => {
    setAddBranchTarget(group)
    setAddBranchId(null)
  }

  // 确认添加厅到合厅组
  const handleAddBranchToGroup = async () => {
    if (!addBranchTarget) return
    if (!addBranchId) {
      toast.error('请选择要添加的厅')
      return
    }
    setAddingBranch(true)
    try {
      await branchGroupsApi.addBranch(addBranchTarget.id, addBranchId)
      toast.success('已添加到合厅组')
      setAddBranchTarget(null)
      setAddBranchId(null)
      await reloadAll()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAddingBranch(false)
    }
  }

  // 从合厅组移除厅
  const handleRemoveBranch = async (group: BranchGroup, branchId: number) => {
    try {
      await branchGroupsApi.removeBranch(group.id, branchId)
      toast.success('已从合厅组移除')
      await reloadAll()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 折叠 / 展开合厅组卡片
  const toggleGroupCollapse = (groupId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  if (!canManage) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  // 已分组的厅 ID 集合（从合厅组列表推导，Branch 本身不携带 groupId）
  const groupedBranchIds = new Set(
    branchGroups.flatMap((g) => g.branches.map((b) => b.id)),
  )

  // 添加厅到合厅组弹窗的可选厅：未分组 且 不在目标组中
  const addBranchCandidates = addBranchTarget
    ? branches.filter(
        (b) =>
          !groupedBranchIds.has(b.id) &&
          !addBranchTarget.branches.some((mb) => mb.id === b.id),
      )
    : []

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="厅管理"
        desc="管理厅信息、统计周期与奖励规则"
      />

      {/* 合厅组管理（仅会长可见） */}
      {isHuizhang && (
        <motion.div
          className="art-card p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitMerge size={18} className="text-primary" />
              <h3 className="text-base font-semibold text-textPrimary">
                合厅组管理
              </h3>
              <span className="text-xs text-textMuted hidden sm:inline">
                将多个厅合并为一组，便于统一管理
              </span>
            </div>
          </div>

          {groupsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-border rounded-custom-sm p-4"
                >
                  <Skeleton className="h-5 w-40 mb-3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : branchGroups.length === 0 ? (
            <div className="py-8 text-center text-sm text-textMuted">
              暂无合厅组，在下方厅列表中选择 2 个及以上厅后点击「合并选中」创建
            </div>
          ) : (
            <div className="space-y-3">
              {branchGroups.map((group) => {
                const collapsed = collapsedGroups.has(group.id)
                return (
                  <div
                    key={group.id}
                    className="border border-border rounded-custom-sm overflow-hidden shadow-sm"
                  >
                    {/* 卡片头部（可点击折叠） */}
                    <div className="flex items-center justify-between px-4 py-3 bg-surface">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="flex items-center gap-2 cursor-pointer text-left flex-1 min-w-0"
                        title={collapsed ? '展开' : '折叠'}
                      >
                        {collapsed ? (
                          <ChevronRight
                            size={16}
                            className="text-textSecondary shrink-0"
                          />
                        ) : (
                          <ChevronDown
                            size={16}
                            className="text-textSecondary shrink-0"
                          />
                        )}
                        <GitMerge
                          size={15}
                          className="text-primary shrink-0"
                        />
                        <span className="text-sm font-semibold text-textPrimary truncate">
                          {group.name}
                        </span>
                        <span className="text-xs text-textMuted shrink-0">
                          {group.branches.length} 个厅
                        </span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openRuleModalForGroup(group)}
                          className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                          title="奖励规则（合并管理）"
                        >
                          <Gift size={15} />
                        </button>
                        <button
                          onClick={() => openSlotModalForGroup(group)}
                          className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                          title="时间段倍率（合并管理）"
                        >
                          <Clock size={15} />
                        </button>
                        <button
                          onClick={() => openNamingModalForGroup(group)}
                          className="p-1.5 text-textSecondary hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors duration-200 cursor-pointer"
                          title="冠名等级（合并管理）"
                        >
                          <Crown size={15} />
                        </button>
                        <button
                          onClick={() => openRenameGroupModal(group)}
                          className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                          title="重命名合厅组"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => openDissolveGroupModal(group)}
                          className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                          title="解散合厅组"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {/* 成员厅列表（可折叠） */}
                    {!collapsed && (
                      <div className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {group.branches.length === 0 ? (
                            <span className="text-xs text-textMuted">
                              暂无成员厅
                            </span>
                          ) : (
                            group.branches.map((b) => (
                              <span
                                key={b.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-custom-sm bg-surface border border-border text-xs text-textPrimary"
                              >
                                {b.name}
                                <button
                                  onClick={() =>
                                    handleRemoveBranch(group, b.id)
                                  }
                                  className="text-textMuted hover:text-danger cursor-pointer transition-colors duration-200"
                                  title="从合厅组移除"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))
                          )}
                          <button
                            onClick={() => openAddBranchToGroupModal(group)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-custom-sm border border-dashed border-border text-xs text-textSecondary hover:text-primary hover:border-primary transition-colors duration-200 cursor-pointer"
                          >
                            <Plus size={12} />
                            添加厅
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      <motion.div
        className="art-card p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              厅管理
            </h3>
            {isHuizhang && selectedBranchIds.size > 0 && (
              <span className="text-xs text-textSecondary ml-2">
                已选 {selectedBranchIds.size} 个
                <button
                  onClick={clearSelection}
                  className="ml-1.5 text-textMuted hover:text-textPrimary underline cursor-pointer"
                >
                  清空
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isHuizhang && (
              <button
                onClick={openCreateGroupModal}
                disabled={selectedBranchIds.size < 2}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-textPrimary rounded-custom-sm text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-textPrimary transition-colors duration-200 cursor-pointer"
                title="选择 2 个及以上厅后可合并为合厅组"
              >
                <GitMerge size={16} />
                合并选中
              </button>
            )}
            {isHuizhang && (
              <button
                onClick={openAddBranchModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover transition-colors duration-200 cursor-pointer"
              >
                <Plus size={16} />
                添加厅
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                {isHuizhang && (
                  <th className="px-4 py-3 w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-textSecondary hover:text-primary cursor-pointer transition-colors duration-200"
                      title="全选/取消全选"
                    >
                      {(() => {
                        const ungroupedIds = branches.filter((b) => !groupedBranchIds.has(b.id)).map((b) => b.id)
                        if (ungroupedIds.length === 0) return <Square size={16} className="text-textMuted" />
                        if (ungroupedIds.every((id) => selectedBranchIds.has(id))) {
                          return <CheckSquare size={16} className="text-primary" />
                        }
                        return <Square size={16} />
                      })()}
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">统计周期</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">人员数</th>
                <th className="px-4 py-3 font-medium">数据数</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {branchesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: isHuizhang ? 7 : 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : branches.length === 0 ? (
                <tr>
                  <td
                    colSpan={isHuizhang ? 7 : 6}
                    className="px-4 py-12 text-center text-textMuted"
                  >
                    暂无厅
                  </td>
                </tr>
              ) : (
                branches.map((b) => {
                  const isGrouped = groupedBranchIds.has(b.id)
                  return (
                    <tr
                      key={b.id}
                      className={`border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 ${
                        selectedBranchIds.has(b.id) ? 'bg-primary/5' : ''
                      } ${isGrouped ? 'opacity-60' : ''}`}
                    >
                      {isHuizhang && (
                        <td className="px-4 py-3">
                          {isGrouped ? (
                            <span
                              className="inline-block text-textMuted cursor-not-allowed"
                              title="该厅已在合厅组中，无法再次合并"
                            >
                              <Square size={16} />
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleBranchSelect(b.id)}
                              className="text-textSecondary hover:text-primary cursor-pointer transition-colors duration-200"
                              title={
                                selectedBranchIds.has(b.id) ? '取消选择' : '选择'
                              }
                            >
                              {selectedBranchIds.has(b.id) ? (
                                <CheckSquare size={16} className="text-primary" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-textPrimary font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {b.name}
                          {isGrouped && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20">
                              已合并
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-surface border border-border">
                          {b.statCycle === 'MONTH' ? '按月' : '按周'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {b.closed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-danger/10 text-danger border border-danger/20">
                            已关闭
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-success/10 text-success border border-success/20">
                            正常
                          </span>
                        )}
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
                          <button
                            onClick={() => openSlotModal(b)}
                            className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                            title="时间段倍率"
                          >
                            <Clock size={16} />
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
                          {canManage && (
                            <button
                              onClick={() => openToggleModal(b)}
                              className={`p-1.5 rounded transition-colors duration-200 cursor-pointer ${
                                b.closed
                                  ? 'text-textSecondary hover:text-success hover:bg-success/10'
                                  : 'text-textSecondary hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              }`}
                              title={b.closed ? '开启厅' : '关闭厅'}
                            >
                              <Power size={16} />
                            </button>
                          )}
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
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleBranchSubmit}
              disabled={branchSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
                  className={`px-4 py-2.5 rounded-custom-sm text-sm border transition-colors duration-200 cursor-pointer ${
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
        title={
          ruleGroup
            ? `奖励规则 - ${ruleGroup.name}（合并管理）`
            : `奖励规则 - ${ruleBranch?.name ?? ''}`
        }
        onClose={() => setRuleModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setRuleModalOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleRuleSave}
              disabled={ruleSaving || ruleLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
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

            {/* 主持福利 */}
            <ToggleRow
              label="主持福利"
              desc="开启后按录入的主持天数 × 每日福利计入基础福利"
              checked={ruleForm.zcEnabled}
              onChange={(v) => setRuleForm({ ...ruleForm, zcEnabled: v })}
            />
            {ruleForm.zcEnabled && (
              <div className="pl-4 border-l-2 border-primary/30 ml-1">
                <NumberInput
                  label="每日主持福利"
                  value={ruleForm.zcDayReward}
                  onChange={(v) =>
                    setRuleForm({ ...ruleForm, zcDayReward: v })
                  }
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 冠名等级弹窗 */}
      <Modal
        open={namingModalOpen}
        title={
          namingGroup
            ? `冠名等级 - ${namingGroup.name}（合并管理）`
            : `冠名等级 - ${namingBranch?.name ?? ''}`
        }
        onClose={() => setNamingModalOpen(false)}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-textMuted leading-relaxed">
            仅按月统计厅支持冠名。录入收光时按阈值整除转换为冠名（逐级扣减，高等级优先），余数计入收光。冠名数 × 等级福利累加到总福利。等级数量可调，等级名称可自定义。
          </p>

          {/* 等级列表 */}
          <div className="overflow-x-auto border border-border rounded-custom-sm">
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
                  className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
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
                  className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">
                  等级福利
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={namingForm.reward ? namingForm.reward : ''}
                  onChange={(e) =>
                    setNamingForm({
                      ...namingForm,
                      reward: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                  placeholder="如：50.50"
                  className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleNamingSubmit}
                disabled={namingSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {namingSubmitting ? <Spinner className="h-4 w-4" /> : <Plus size={16} />}
                {namingFormId ? '保存修改' : '添加等级'}
              </button>
              {namingFormId && (
                <button
                  onClick={resetNamingForm}
                  className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
                >
                  取消编辑
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* 时间段倍率弹窗 */}
      <Modal
        open={slotModalOpen}
        title={
          slotGroup
            ? `时间段倍率 - ${slotGroup.name}（合并管理）`
            : `时间段倍率 - ${slotBranch?.name ?? ''}`
        }
        onClose={() => setSlotModalOpen(false)}
        width="max-w-2xl"
        footer={
          <>
            <button
              onClick={() => setSlotModalOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSlotSave}
              disabled={slotSaving || slotLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {slotSaving ? <Spinner className="h-4 w-4" /> : <Clock size={16} />}
              {slotSaving ? '保存中...' : '保存倍率'}
            </button>
          </>
        }
      >
        {slotLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-textMuted leading-relaxed">
              {slotGroup
                ? `合厅组合并管理：保存时将批量应用到该合厅组的所有成员厅。解散合厅组后各厅保留当前设置。`
                : `开启后，添加数据时可按「日期 + 时间段」录入麦序，系统按各时间段倍率自动换算。`}
              一天共 12 个时间段（0-2、2-4、...、22-24），每个时间段可独立设置倍率。
              录入示例：0-2 和 2-4 倍率均为 1.5，分别录 1 麦序 → 实际计入 (1×1.5 + 1×1.5) = 3 麦序。
            </p>

            {/* 时间段倍率功能开关 */}
            <ToggleRow
              label="时间段倍率"
              desc="开启后添加数据弹窗使用日期+时间段录入，并按倍率自动换算麦序"
              checked={slotEnabled}
              onChange={setSlotEnabled}
            />

            {/* 12 个时间段倍率输入 */}
            <div
              className={`grid grid-cols-2 sm:grid-cols-3 gap-3 transition-opacity duration-200 ${
                slotEnabled ? '' : 'opacity-40 pointer-events-none'
              }`}
            >
              {SLOT_LABELS.map((label, idx) => (
                <div key={idx}>
                  <label className="block text-xs text-textSecondary mb-1">
                    {label} 时段
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={slotMultipliers[idx] ? slotMultipliers[idx] : ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setSlotMultipliers((prev) => {
                        const next = [...prev]
                        next[idx] = v === '' ? 0 : Number(v)
                        return next
                      })
                    }}
                    disabled={!slotEnabled}
                    placeholder="1"
                    className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
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
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleConfirmDelete}
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
          <div className="p-3 rounded-custom-sm bg-danger/10 border border-danger/20">
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
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* 关闭/开启厅确认弹窗 */}
      <Modal
        open={toggleTarget !== null}
        title={toggleTarget?.closed ? '开启厅' : '关闭厅'}
        onClose={() => setToggleTarget(null)}
        footer={
          <>
            <button
              onClick={() => setToggleTarget(null)}
              disabled={toggling}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleConfirmToggle}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-custom-sm text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer ${
                toggleTarget?.closed
                  ? 'bg-success hover:bg-success/90'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {toggling ? <Spinner className="h-4 w-4" /> : <Power size={16} />}
              {toggling ? '处理中...' : toggleTarget?.closed ? '确认开启' : '确认关闭'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {toggleTarget?.closed ? (
            <p className="text-sm text-textSecondary leading-relaxed">
              确认开启厅「{toggleTarget.name}」？开启后该厅将恢复在公开看板/排名中显示，并允许录入新数据。
            </p>
          ) : (
            <div className="p-3 rounded-custom-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                关闭厅「{toggleTarget?.name}」
              </p>
              <p className="text-xs text-textSecondary mt-1 leading-relaxed">
                关闭后，该厅将不在公开看板/排名中显示，且无法录入新数据。历史数据保留，可随时重新开启。
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* 创建合厅组弹窗 */}
      <Modal
        open={createGroupModalOpen}
        title="创建合厅组"
        onClose={() => setCreateGroupModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setCreateGroupModalOpen(false)}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={creatingGroup}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {creatingGroup ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <GitMerge size={16} />
              )}
              {creatingGroup ? '创建中...' : '创建合厅组'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-textSecondary">
            将选中的 {selectedBranchIds.size} 个厅合并为一个合厅组，合并后可在合厅组管理中统一操作。
          </p>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              合厅组名称
            </label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creatingGroup) handleCreateGroup()
              }}
              placeholder="请输入合厅组名称"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              成员厅
            </label>
            <div className="flex flex-wrap gap-1.5">
              {branches
                .filter((b) => selectedBranchIds.has(b.id))
                .map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center px-2 py-1 rounded-custom-sm bg-surface border border-border text-xs text-textPrimary"
                  >
                    {b.name}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 重命名合厅组弹窗 */}
      <Modal
        open={renameGroupTarget !== null}
        title="重命名合厅组"
        onClose={() => {
          setRenameGroupTarget(null)
          setRenameGroupName('')
        }}
        footer={
          <>
            <button
              onClick={() => {
                setRenameGroupTarget(null)
                setRenameGroupName('')
              }}
              disabled={renamingGroup}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleRenameGroup}
              disabled={renamingGroup}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {renamingGroup ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Pencil size={16} />
              )}
              {renamingGroup ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            合厅组名称
          </label>
          <input
            type="text"
            value={renameGroupName}
            onChange={(e) => setRenameGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renamingGroup) handleRenameGroup()
            }}
            placeholder="请输入新的合厅组名称"
            autoFocus
            className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
          />
        </div>
      </Modal>

      {/* 解散合厅组确认弹窗 */}
      <Modal
        open={dissolveGroupTarget !== null}
        title="解散合厅组"
        onClose={() => setDissolveGroupTarget(null)}
        footer={
          <>
            <button
              onClick={() => setDissolveGroupTarget(null)}
              disabled={dissolvingGroup}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleDissolveGroup}
              disabled={dissolvingGroup}
              className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-custom-sm text-sm font-medium hover:bg-danger/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {dissolvingGroup ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Trash2 size={16} />
              )}
              {dissolvingGroup ? '解散中...' : '确认解散'}
            </button>
          </>
        }
      >
        <div className="p-3 rounded-custom-sm bg-danger/10 border border-danger/20">
          <p className="text-sm text-danger font-medium">
            解散合厅组「{dissolveGroupTarget?.name}」
          </p>
          <p className="text-xs text-textSecondary mt-1 leading-relaxed">
            解散后，该合厅组中的厅将不再归属任何合厅组，厅本身的数据不受影响。此操作不可撤销。
          </p>
        </div>
      </Modal>

      {/* 添加厅到合厅组弹窗 */}
      <Modal
        open={addBranchTarget !== null}
        title={`添加厅到「${addBranchTarget?.name ?? ''}」`}
        onClose={() => {
          setAddBranchTarget(null)
          setAddBranchId(null)
        }}
        footer={
          <>
            <button
              onClick={() => {
                setAddBranchTarget(null)
                setAddBranchId(null)
              }}
              disabled={addingBranch}
              className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleAddBranchToGroup}
              disabled={addingBranch || !addBranchId}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {addingBranch ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Plus size={16} />
              )}
              {addingBranch ? '添加中...' : '添加'}
            </button>
          </>
        }
      >
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            选择未分组的厅
          </label>
          {addBranchCandidates.length === 0 ? (
            <p className="text-xs text-textMuted py-4 text-center">
              暂无可添加的厅（所有厅均已分组）
            </p>
          ) : (
            <GroupedSelect
              value={addBranchId !== null ? String(addBranchId) : ''}
              onChange={(val) =>
                setAddBranchId(val ? Number(val) : null)
              }
              placeholder="请选择厅"
              fullWidth
              topOption={{ value: '', label: '请选择厅' }}
              options={addBranchCandidates.map((b) => ({
                value: String(b.id),
                label: b.name,
              }))}
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
