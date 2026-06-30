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
  CheckCheck,
  Pencil,
  Home,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { notificationsApi, authApi, getErrorMessage } from '../api'
import { useToast } from '../hooks/useToast'
import type { Notification } from '../types'
import { getRoleText, formatDateTime } from '../utils'
import ThemeToggle from './ThemeToggle'
import Modal from './Modal'
import { Spinner } from './Skeleton'

interface LayoutProps {
  children: ReactNode
}

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

const pageTitleMap: Record<string, string> = {
  '/dashboard': '数据看板',
  '/data': '数据录入',
  '/ranking': '排名与福利',
  '/personnel': '人员管理',
  '/settings': '系统设置',
  '/settings/accounts': '账户管理',
  '/settings/branches': '厅管理',
  '/settings/notifications': '通知列表',
  '/settings/history': '录入历史记录',
  '/settings/login-records': '登录记录',
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // 账户管理统一弹窗（编辑昵称 / 修改密码 / 退出登录）
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [accountTab, setAccountTab] = useState<'nickname' | 'password' | 'logout'>('nickname')

  // 编辑昵称
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameSubmitting, setNicknameSubmitting] = useState(false)

  // 修改密码
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  const openAccountModal = (tab: 'nickname' | 'password' | 'logout') => {
    setAccountTab(tab)
    if (tab === 'nickname') {
      setNicknameInput(user?.nickname ?? '')
    } else if (tab === 'password') {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    setAccountModalOpen(true)
  }

  const handleNicknameSubmit = async () => {
    setNicknameSubmitting(true)
    try {
      await authApi.updateMe({ nickname: nicknameInput.trim() })
      await refreshUser()
      toast.success('昵称已更新')
      setAccountModalOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setNicknameSubmitting(false)
    }
  }

  const handlePasswordSubmit = async () => {
    // 前端校验
    if (!currentPassword) {
      toast.error('请输入当前密码')
      return
    }
    if (!newPassword) {
      toast.error('请输入新密码')
      return
    }
    if (newPassword.length < 6 || newPassword.length > 50) {
      toast.error('新密码长度需为 6-50 位')
      return
    }
    if (currentPassword === newPassword) {
      toast.error('新密码不能与当前密码相同')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setPasswordSubmitting(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('密码修改成功')
      setAccountModalOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPasswordSubmitting(false)
    }
  }

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
    navigate('/')
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

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return
    try {
      const result = await notificationsApi.markAllRead()
      toast.success(`已标记 ${result.count} 条为已读`)
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch (err) {
      toast.error(getErrorMessage(err))
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
              onClick={() => openAccountModal('nickname')}
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
            {/* 返回公开看板首页 */}
            <a
              href="/"
              aria-label="返回首页"
              title="返回公开看板"
              className="flex items-center gap-1.5 p-2 text-textSecondary hover:text-primary rounded-lg hover:bg-primary/10 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Home size={20} />
              <span className="hidden sm:inline text-sm">首页</span>
            </a>
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
                    {/* 头部：标题 + 全部已读 */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
                      <span className="text-xs font-medium text-textSecondary">
                        通知{unreadCount > 0 && `（${unreadCount} 条未读）`}
                      </span>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors duration-200 cursor-pointer"
                        >
                          <CheckCheck size={12} />
                          全部已读
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto scrollbar-thin">
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
                              {formatDateTime(n.createdAt)}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    {/* 底部：查看全部 */}
                    {notifications.length > 0 && (
                      <button
                        onClick={() => {
                          setNotifOpen(false)
                          navigate('/settings/notifications')
                        }}
                        className="block w-full text-center px-4 py-2 border-t border-border text-xs text-textSecondary hover:text-textPrimary hover:bg-surface transition-colors duration-200 cursor-pointer"
                      >
                        查看全部通知
                      </button>
                    )}
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

      {/* 账户管理统一弹窗（编辑昵称 / 修改密码 / 退出登录） */}
      <Modal
        open={accountModalOpen}
        title="账户管理"
        onClose={() => setAccountModalOpen(false)}
      >
        {/* 标签切换 */}
        <div className="flex border-b border-border mb-4 -mt-1">
          {([
            { key: 'nickname', label: '编辑昵称' },
            { key: 'password', label: '修改密码' },
            { key: 'logout', label: '退出登录' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAccountTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 cursor-pointer ${
                accountTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-textSecondary hover:text-textPrimary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 编辑昵称 */}
        {accountTab === 'nickname' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                用户名
                <span className="ml-1 text-[10px] text-textMuted">（不可修改）</span>
              </label>
              <input
                type="text"
                value={user?.username ?? ''}
                disabled
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-textMuted cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                昵称
                <span className="ml-1 text-[10px] text-textMuted">（选填，仅展示用）</span>
              </label>
              <input
                type="text"
                maxLength={50}
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !nicknameSubmitting) {
                    handleNicknameSubmit()
                  }
                }}
                placeholder="可选，最多 50 字"
                autoFocus
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAccountModalOpen(false)}
                disabled={nicknameSubmitting}
                className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleNicknameSubmit}
                disabled={nicknameSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {nicknameSubmitting && <Spinner className="h-4 w-4" />}
                {nicknameSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* 修改密码 */}
        {accountTab === 'password' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                当前密码
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
                autoFocus
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                新密码
                <span className="ml-1 text-[10px] text-textMuted">（6-50 位）</span>
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码"
                maxLength={50}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">
                确认新密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !passwordSubmitting) {
                    handlePasswordSubmit()
                  }
                }}
                placeholder="请再次输入新密码"
                maxLength={50}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAccountModalOpen(false)}
                disabled={passwordSubmitting}
                className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handlePasswordSubmit}
                disabled={passwordSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {passwordSubmitting && <Spinner className="h-4 w-4" />}
                {passwordSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* 退出登录 */}
        {accountTab === 'logout' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-danger/10 rounded-lg">
              <LogOut size={20} className="text-danger shrink-0 mt-0.5" />
              <div className="text-sm text-textPrimary">
                确认退出当前账户？
                <div className="text-xs text-textMuted mt-1">
                  退出后需重新登录才能访问后台管理功能。
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAccountModalOpen(false)}
                className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 transition-colors duration-200 cursor-pointer"
              >
                <LogOut size={16} />
                确认退出
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
