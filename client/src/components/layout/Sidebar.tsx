import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileInput,
  Users,
  Settings,
  BarChart3,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: '数据看板', icon: LayoutDashboard },
  { to: '/data', label: '数据录入', icon: FileInput },
  { to: '/personnel', label: '人员管理', icon: Users },
  { to: '/settings', label: '系统设置', icon: Settings },
]

interface SidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void
}

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
}: SidebarProps) {
  return (
    <aside
      className={`sidebar-aside fixed inset-y-0 left-0 z-40 bg-card border-r border-border flex flex-col overflow-hidden ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={{ width: sidebarCollapsed ? '4rem' : '15rem' }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 border-b border-border shrink-0 px-4">
        <div className="w-8 h-8 rounded-custom-sm bg-primary flex items-center justify-center shrink-0">
          <BarChart3 size={18} className="text-white" />
        </div>
        <span
          className={`sidebar-text text-lg font-semibold text-textPrimary ml-2 ${
            sidebarCollapsed ? 'lg:opacity-0 lg:max-w-0 lg:ml-0' : 'lg:opacity-100 lg:max-w-[200px]'
          }`}
        >
          统计系统
        </span>
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
                `nav-item relative flex items-center gap-3 px-3 py-2.5 rounded-custom-sm text-sm font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  sidebarCollapsed ? 'lg:justify-center' : ''
                } ${
                  isActive
                    ? 'nav-item-active bg-primary/10 text-primary'
                    : 'text-textSecondary hover:bg-surface hover:text-textPrimary'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span
                className={`sidebar-text ${
                  sidebarCollapsed ? 'lg:opacity-0 lg:max-w-0' : 'lg:opacity-100 lg:max-w-[200px]'
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
