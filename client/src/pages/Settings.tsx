import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield,
  Building2,
  Bell,
  History,
  LogIn,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import MagicBento, { type MagicBentoItem } from '../components/MagicBento'

interface SettingsEntry {
  to: string
  label: string
  desc: string
  icon: typeof Shield
  visible: boolean
}

export default function Settings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isHuizhang = user?.role === 'HUIZHANG'
  const isChaoguan = user?.role === 'CHAOGUAN'
  const canManageAccounts = isHuizhang || isChaoguan
  const canViewHistory = isHuizhang || isChaoguan

  const entries: SettingsEntry[] = [
    {
      to: '/settings/accounts',
      label: '账户管理',
      desc: '创建、编辑、禁用或删除系统账户，分配角色与厅',
      icon: Shield,
      visible: canManageAccounts,
    },
    {
      to: '/settings/branches',
      label: '厅管理',
      desc: '创建、编辑、删除厅，配置奖励规则与统计周期',
      icon: Building2,
      visible: isHuizhang || isChaoguan,
    },
    {
      to: '/settings/notifications',
      label: '通知列表',
      desc: '查看系统通知，规则变更与数据更新提醒',
      icon: Bell,
      visible: true,
    },
    {
      to: '/settings/history',
      label: '录入历史记录',
      desc: '查看谁录入了数据、谁修改了数据，追溯每次操作',
      icon: History,
      visible: canViewHistory,
    },
    {
      to: '/settings/login-records',
      label: '登录记录',
      desc: '查看账户登录的设备与时间，仅会长可见',
      icon: LogIn,
      visible: isHuizhang,
    },
  ]

  const visibleEntries = entries.filter((e) => e.visible)

  const magicItems: MagicBentoItem[] = visibleEntries.map((entry) => {
    const Icon = entry.icon
    return {
      title: entry.label,
      description: entry.desc,
      label: '进入',
      icon: <Icon size={20} />,
      onClick: () => navigate(entry.to),
    }
  })

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className="text-xl font-semibold text-textPrimary mb-1">
          系统设置
        </h2>
        <p className="text-sm text-textSecondary">
          选择下方分类进入对应设置子页面
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
      >
        <MagicBento
          items={magicItems}
          textAutoHide={false}
          enableStars
          enableBorderGlow
          enableTilt
          enableMagnetism
          clickEffect
          particleCount={10}
        />
      </motion.div>
    </div>
  )
}
