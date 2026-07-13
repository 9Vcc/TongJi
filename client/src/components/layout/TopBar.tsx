import { useLocation } from 'react-router-dom'
import { Menu, Bell, Home } from 'lucide-react'
import ThemeToggle from '../ThemeToggle'
import type { Notification } from '../../types'
import NotificationDropdown from './NotificationDropdown'

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

interface TopBarProps {
  onOpenSidebar: () => void
  notifOpen: boolean
  setNotifOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  notifications: Notification[]
  unreadCount: number
  onMarkRead: (id: number) => void | Promise<void>
  onMarkAllRead: () => void | Promise<void>
  onViewAllNotifications: () => void
}

export default function TopBar({
  onOpenSidebar,
  notifOpen,
  setNotifOpen,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onViewAllNotifications,
}: TopBarProps) {
  const location = useLocation()
  const pageTitle = pageTitleMap[location.pathname] || '统计系统'

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 text-textSecondary hover:text-textPrimary rounded-lg hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={onOpenSidebar}
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
          <NotificationDropdown
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={onMarkRead}
            onMarkAllRead={onMarkAllRead}
            onViewAll={onViewAllNotifications}
          />
        </div>
      </div>
    </header>
  )
}
