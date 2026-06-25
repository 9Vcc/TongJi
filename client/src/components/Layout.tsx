import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  FileInput,
  Trophy,
  Users,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { notificationsApi } from '../api'
import type { Notification } from '../types'
import { getRoleText } from '../utils'
import ThemeToggle from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
  { to: '/', label: '数据看板', icon: LayoutDashboard },
  { to: '/data', label: '数据录入', icon: FileInput },
  { to: '/ranking', label: '排名与福利', icon: Trophy },
  { to: '/personnel', label: '人员管理', icon: Users },
  { to: '/settings', label: '系统设置', icon: Settings },
]

const pageTitleMap: Record<string, string> = {
  '/': '数据看板',
  '/data': '数据录入',
  '/ranking': '排名与福利',
  '/personnel': '人员管理',
  '/settings': '系统设置',
  '/settings/accounts': '账户管理',
  '/settings/branches': '厅管理',
  '/settings/notifications': '通知列表',
  '/settings/history': '录入历史记录',
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  const unreadCount = notifications.filter((n) => !n.isRead).length
  const pageTitle = pageTitleMap[location.pathname] || '统计系统'

  useEffect(() => {
    notificationsApi
      .list()
      .then(setNotifications)
      .catch(() => {})
  }, [location.pathname])

  // ESC 关闭侧边栏 / 通知下拉
  useEffect(() => {
    if (!sidebarOpen && !notifOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sidebarOpen, notifOpen])

  // 路由变化时关闭移动端侧边栏
  useEffect(() => {
    setSidebarOpen(false)
    setNotifOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
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

  return (
    <div className="min-h-screen bg-surface">
      {/* 固定侧边栏（独立，不随页面滚动） */}
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
            <div className="text-sm font-medium text-textPrimary truncate">
              {user?.username}
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
          <button
            onClick={handleLogout}
            aria-label="退出登录"
            title={sidebarCollapsed ? '退出登录' : undefined}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50 ${
              sidebarCollapsed ? 'lg:justify-center' : ''
            }`}
          >
            <LogOut size={16} className="shrink-0" />
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.span
                  key="logout-text"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  退出登录
                </motion.span>
              )}
            </AnimatePresence>
          </button>
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

      {/* 遮罩层（移动端） */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* 主内容区（左侧留出侧边栏宽度，随折叠状态动画） */}
      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
      >
        {/* 顶部栏 */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 text-textSecondary hover:text-textPrimary rounded-lg hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开菜单"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-base lg:text-lg font-semibold text-textPrimary">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* 主题切换 */}
            <ThemeToggle />
            {/* 通知 */}
            <div className="relative">
              <button
                className="relative p-2 text-textSecondary hover:text-textPrimary rounded-lg hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={`通知${unreadCount > 0 ? `（${unreadCount}条未读）` : ''}`}
                aria-expanded={notifOpen}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-danger text-white text-[10px] rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {/* 通知下拉 */}
              <AnimatePresence>
                {notifOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setNotifOpen(false)}
                      aria-hidden="true"
                    />
                    <motion.div
                      className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      style={{ transformOrigin: 'top right' }}
                    >
                    <div className="max-h-96 overflow-y-auto scrollbar-thin">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-textMuted">
                          暂无通知
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleMarkRead(n.id)}
                            className={`block w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-surface transition-colors duration-200 cursor-pointer ${
                              !n.isRead ? 'bg-primary/5' : ''
                            }`}
                          >
                            <div className="text-sm text-textPrimary">
                              {n.content}
                            </div>
                            <div className="text-xs text-textMuted mt-1">
                              {new Date(n.createdAt).toLocaleString('zh-CN')}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* 内容区 */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>

      {/* 移动端关闭按钮 */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            className="fixed top-4 right-4 z-50 lg:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭菜单"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
          <X size={24} />
        </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
