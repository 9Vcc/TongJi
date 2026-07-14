import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  FileInput,
  Trophy,
  Users,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getRoleText } from '../../utils'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { to: '/data', label: '数据录入', icon: FileInput },
  { to: '/ranking', label: '排名与福利', icon: Trophy },
  { to: '/personnel', label: '人员管理', icon: Users },
  { to: '/settings', label: '系统设置', icon: Settings },
]

interface SidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void
  onOpenAccount: () => void
}

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  setSidebarCollapsed,
  onOpenAccount,
}: SidebarProps) {
  const { user } = useAuth()

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-60 bg-card border-r border-border flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-60'}`}
    >
      {/* Logo */}
      <div className="flex items-center h-16 border-b border-border shrink-0 px-4">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <BarChart3 size={18} className="text-white" />
        </div>
        <AnimatePresence initial={false}>
          {!sidebarCollapsed && (
            <motion.span
              key="logo-text"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg font-semibold text-textPrimary whitespace-nowrap overflow-hidden ml-2"
            >
              统计系统
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              title={sidebarCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  sidebarCollapsed ? 'lg:justify-center' : ''
                } ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-textSecondary hover:bg-surface hover:text-textPrimary'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <AnimatePresence initial={false}>
                {!sidebarCollapsed && (
                  <motion.span
                    key={`label-${item.to}`}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          )
        })}
      </nav>

      {/* 用户信息 */}
      <div className="px-2 py-3 border-t border-border shrink-0">
        <div
          className={`px-3 py-2 mb-1 ${
            sidebarCollapsed ? 'lg:px-0 lg:text-center' : ''
          }`}
        >
          <div className="text-sm font-medium text-textPrimary min-w-0">
            {user?.nickname?.trim() ? (
              <>
                {user.nickname}
                {!sidebarCollapsed && (
                  <span className="ml-1 text-xs text-textMuted font-normal">
                    ({user.username})
                  </span>
                )}
              </>
            ) : (
              user?.username
            )}
          </div>
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.div
                key="user-role"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-textMuted overflow-hidden whitespace-nowrap"
              >
                {getRoleText(user?.role || '')}
                {user?.branchId ? ` · 厅ID ${user.branchId}` : ''}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <button
            onClick={onOpenAccount}
            aria-label="账户管理"
            title={sidebarCollapsed ? '账户管理' : undefined}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-textSecondary hover:text-primary hover:bg-primary/10 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              sidebarCollapsed ? 'lg:justify-center' : ''
            }`}
          >
            <Pencil size={16} className="shrink-0" />
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.span
                  key="account-text"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  账户管理
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* 桌面端折叠/展开按钮（浮于侧边栏右边缘，醒目样式） */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        className="hidden lg:flex absolute top-1/2 -right-4 -translate-y-1/2 z-50 w-8 h-8 bg-primary text-white rounded-full items-center justify-center shadow-md hover:shadow-lg hover:scale-110 hover:bg-primary-hover active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        {sidebarCollapsed ? (
          <ChevronRight size={18} />
        ) : (
          <ChevronLeft size={18} />
        )}
      </button>
    </aside>
  )
}
