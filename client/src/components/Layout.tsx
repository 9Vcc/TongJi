import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { notificationsApi, getErrorMessage } from '../api'
import { useToast } from '../hooks/useToast'
import type { Notification } from '../types'
import Sidebar from './layout/Sidebar'
import TopBar from './layout/TopBar'
import AccountModal from './layout/AccountModal'
import SettingsPanel from './layout/SettingsPanel'
import GlobalSpotlight from './GlobalSpotlight'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // 账户管理弹窗
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  // 外观设置面板
  const [settingsOpen, setSettingsOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.isRead).length

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
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
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
      {/* 全局聚光灯：跟随鼠标照亮附近卡片 */}
      <GlobalSpotlight />

      {/* 固定侧边栏（独立，不随页面滚动） */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

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
      {/* sidebar-content 类通过 CSS 变量 --sidebar-w 控制 margin-left，仅在 lg 屏幕生效 */}
      <div
        className="sidebar-content flex flex-col min-h-screen"
        style={{ '--sidebar-w': sidebarCollapsed ? '4rem' : '15rem' } as CSSProperties}
      >
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAccount={() => setAccountModalOpen(true)}
          onLogout={handleLogout}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          notifOpen={notifOpen}
          setNotifOpen={setNotifOpen}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onViewAllNotifications={() => {
            setNotifOpen(false)
            navigate('/settings/notifications')
          }}
        />

        {/* 内容区 */}
        <main id="main-scroll" className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
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

      {/* 账户管理弹窗（编辑昵称 / 修改密码 / 退出登录） */}
      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        onLoggedOut={handleLogout}
      />

      {/* 外观设置面板（主色预设 / 边框阴影模式 / 圆角系数） */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
