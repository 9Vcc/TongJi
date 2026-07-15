import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getRoleText } from '../../utils'

interface UserMenuProps {
  /** 打开账户管理弹窗 */
  onOpenAccount: () => void
  /** 直接退出登录 */
  onLogout: () => void
}

/**
 * 右上角用户菜单：头像 + 下拉列表
 * 参考 art-design-pro 的 ArtUserMenu 设计
 * 下拉项：用户信息展示、账户管理、退出登录
 */
export default function UserMenu({ onOpenAccount, onLogout }: UserMenuProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // 显示名：优先昵称，回退用户名
  const displayName = user?.nickname?.trim() || user?.username || '用户'
  // 头像首字母
  const avatarLetter = displayName.charAt(0).toUpperCase()

  const handleAccountClick = () => {
    setOpen(false)
    onOpenAccount()
  }

  const handleLogoutClick = () => {
    setOpen(false)
    onLogout()
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* 头像按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 p-1 pr-2 rounded-full hover:bg-surface tad-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label="用户菜单"
        aria-expanded={open}
      >
        {/* 首字母头像 */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white text-sm font-semibold shrink-0 shadow-sm">
          {avatarLetter}
        </div>
        <ChevronDown
          size={14}
          className={`text-textMuted tad-200 hidden sm:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉菜单 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-2 w-60 bg-card/95 backdrop-blur-xl border border-border rounded-custom shadow-xl overflow-hidden z-50"
            role="menu"
          >
            {/* 用户信息头部 */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white text-base font-semibold shrink-0">
                {avatarLetter}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-textPrimary truncate">
                  {displayName}
                </p>
                <p className="text-xs text-textMuted truncate mt-0.5">
                  {getRoleText(user?.role || '')}
                  {user?.branchId ? ` · 厅ID ${user.branchId}` : ''}
                </p>
              </div>
            </div>

            {/* 菜单项 */}
            <div className="py-1.5">
              <button
                onClick={handleAccountClick}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-textSecondary hover:text-textPrimary hover:bg-surface tad-200 cursor-pointer focus:outline-none"
                role="menuitem"
              >
                <User size={16} className="shrink-0" />
                <span>账户管理</span>
              </button>
              <button
                onClick={handleLogoutClick}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-textSecondary hover:text-danger hover:bg-danger/5 tad-200 cursor-pointer focus:outline-none"
                role="menuitem"
              >
                <LogOut size={16} className="shrink-0" />
                <span>退出登录</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
