import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, Settings as SettingsIcon, CheckCircle } from 'lucide-react'
import { notificationsApi } from '../../api'
import SubPageHeader from '../../components/SubPageHeader'
import type { Notification } from '../../types'
import { formatDateTime } from '../../utils'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    notificationsApi
      .list()
      .then(setNotifications)
      .catch(() => {})
  }, [])

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

  const notificationIcon = (type: Notification['type']) => {
    if (type === 'RULE_CHANGE') return SettingsIcon
    if (type === 'DATA_UPDATE') return CheckCircle
    return Bell
  }

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="通知列表"
        desc="查看系统通知，规则变更与数据更新提醒"
      />
      <motion.div
      className="bg-card border border-border rounded-xl p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-primary" />
        <h3 className="text-base font-semibold text-textPrimary">通知列表</h3>
      </div>
      {notifications.length === 0 ? (
        <div className="py-6 text-center text-sm text-textMuted">
          暂无通知
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = notificationIcon(n.type)
            return (
              <button
                key={n.id}
                onClick={() => handleMarkRead(n.id)}
                className={`flex items-start gap-3 w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-surface hover:border-primary/50 transition-colors duration-200 cursor-pointer ${
                  !n.isRead ? 'bg-primary/5' : ''
                }`}
              >
                <div className="mt-0.5">
                  <Icon size={18} className="text-textSecondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-textPrimary">
                      {n.content}
                    </span>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-textMuted mt-1">
                    {formatDateTime(n.createdAt)}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </motion.div>
    </div>
  )
}
