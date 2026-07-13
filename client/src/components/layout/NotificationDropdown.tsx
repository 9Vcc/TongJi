import { motion, AnimatePresence } from 'framer-motion'
import { CheckCheck } from 'lucide-react'
import { formatDateTime } from '../../utils'
import type { Notification } from '../../types'

interface NotificationDropdownProps {
  open: boolean
  onClose: () => void
  notifications: Notification[]
  unreadCount: number
  onMarkRead: (id: number) => void | Promise<void>
  onMarkAllRead: () => void | Promise<void>
  onViewAll: () => void
}

export default function NotificationDropdown({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onViewAll,
}: NotificationDropdownProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={onClose}
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
                  onClick={onMarkAllRead}
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
                    onClick={() => onMarkRead(n.id)}
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
                onClick={onViewAll}
                className="block w-full text-center px-4 py-2 border-t border-border text-xs text-textSecondary hover:text-textPrimary hover:bg-surface transition-colors duration-200 cursor-pointer"
              >
                查看全部通知
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
