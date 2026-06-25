import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield,
  Building2,
  Bell,
  ChevronRight,
  History,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

interface SettingsEntry {
  to: string
  label: string
  desc: string
  icon: typeof Shield
  visible: boolean
}

export default function Settings() {
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
  ]

  const visibleEntries = entries.filter((e) => e.visible)

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleEntries.map((entry, i) => {
          const Icon = entry.icon
          return (
            <motion.div
              key={entry.to}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.05 * (i + 1),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <NavLink
                to={entry.to}
                className="block bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all duration-200 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors duration-200">
                      <Icon size={20} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-textPrimary">
                        {entry.label}
                      </h3>
                      <p className="text-sm text-textSecondary mt-1">
                        {entry.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-textMuted shrink-0 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200"
                  />
                </div>
              </NavLink>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
