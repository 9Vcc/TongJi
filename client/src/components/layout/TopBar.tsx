import { useLocation } from 'react-router-dom'
import { Menu, Bell, Home, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import ThemeToggle from '../ThemeToggle'
import type { Notification } from '../../types'
import NotificationDropdown from './NotificationDropdown'
import UserMenu from './UserMenu'

const pageTitleMap: Record<string, string> = {
  '/dashboard': '数据看板',
  '/data': '数据录入',
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
  onOpenSettings: () => void
  onOpenAccount: () => void
  onLogout: () => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void
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
  onOpenSettings,
  onOpenAccount,
  onLogout,
  sidebarCollapsed,
  setSidebarCollapsed,
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
    <header className="h-16 bg-card/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        {/* 移动端：打开侧边栏抽屉 */}
        <button
          className="lg:hidden p-2 text-textSecondary hover:text-textPrimary rounded-custom-sm hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={onOpenSidebar}
          aria-label="打开菜单"
        >
          <Menu size={22} />
        </button>
        {/* 桌面端：折叠/展开侧边栏（参考 art-design-pro 顶栏菜单按钮） */}
        <button
          className="hidden lg:flex p-2 text-textSecondary hover:text-textPrimary rounded-custom-sm hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <h1 className="text-base lg:text-lg font-semibold text-textPrimary">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-1.5">
        {/* 返回公开看板首页 */}
        <a
          href="/"
          aria-label="返回首页"
          title="返回公开看板"
          className="icon-moveup-hover flex items-center gap-1.5 p-2 text-textSecondary hover:text-primary rounded-custom-sm hover:bg-primary/10 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Home size={20} />
          <span className="hidden sm:inline text-sm">首页</span>
        </a>
        {/* 主题切换 */}
        <ThemeToggle />
        {/* 外观设置 */}
        <button
          onClick={onOpenSettings}
          className="icon-rotate-hover p-2 text-textSecondary hover:text-textPrimary rounded-custom-sm hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="外观设置"
          title="外观设置"
        >
          <Settings size={20} />
        </button>
        {/* 通知 */}
        <div className="relative">
          <button
            className="icon-shake-hover relative p-2 text-textSecondary hover:text-textPrimary rounded-custom-sm hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
        {/* 用户头像 + 下拉菜单 */}
        <div className="ml-1.5 pl-1.5 border-l border-border">
          <UserMenu onOpenAccount={onOpenAccount} onLogout={onLogout} />
        </div>
      </div>
    </header>
  )
}
