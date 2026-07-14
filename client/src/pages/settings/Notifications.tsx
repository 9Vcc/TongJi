import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  Settings as SettingsIcon,
  Trophy,
  Database,
  CheckCheck,
  Trash2,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
} from 'lucide-react'
import { notificationsApi, getErrorMessage } from '../../api'
import { useToast } from '../../hooks/useToast'
import SubPageHeader from '../../components/SubPageHeader'
import { Skeleton } from '../../components/Skeleton'
import GroupedSelect from '../../components/GroupedSelect'
import { formatDateTime } from '../../utils'
import type { Notification, NotificationType } from '../../types'

// 通知类型显示配置
const TYPE_MAP: Record<
  NotificationType,
  { label: string; cls: string; icon: typeof Bell }
> = {
  RULE_CHANGE: {
    label: '规则变更',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: SettingsIcon,
  },
  RANK_PUBLISH: {
    label: '排名公布',
    cls:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    icon: Trophy,
  },
  DATA_CHANGE: {
    label: '数据变更',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Database,
  },
}

export default function NotificationsPage() {
  const toast = useToast()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  // 筛选条件
  const [filterType, setFilterType] = useState<NotificationType | ''>('')
  const [filterIsRead, setFilterIsRead] = useState<'' | 'true' | 'false'>('')

  // 分页：每页 50 条
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof notificationsApi.list>[0] = { limit: 500 }
      if (filterType) params.type = filterType
      if (filterIsRead) params.isRead = filterIsRead === 'true'
      const list = await notificationsApi.list(params)
      setNotifications(list)
      setCurrentPage(1)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterIsRead])

  // 标记单条已读
  const handleMarkRead = async (id: number) => {
    try {
      await notificationsApi.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 全部已读
  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead)
    if (unread.length === 0) {
      toast.info('没有未读通知')
      return
    }
    try {
      const result = await notificationsApi.markAllRead()
      toast.success(`已标记 ${result.count} 条为已读`)
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 删除单条
  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除该通知？')) return
    try {
      await notificationsApi.remove(id)
      toast.success('删除成功')
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 清空已读
  const handleClearRead = async () => {
    const readCount = notifications.filter((n) => n.isRead).length
    if (readCount === 0) {
      toast.info('没有已读通知可清空')
      return
    }
    if (!window.confirm(`确认清空 ${readCount} 条已读通知？`)) return
    try {
      const result = await notificationsApi.clearRead()
      toast.success(`已清空 ${result.count} 条已读通知`)
      setNotifications((prev) => prev.filter((n) => !n.isRead))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // 重置筛选
  const handleReset = () => {
    setFilterType('')
    setFilterIsRead('')
  }

  const hasFilter = filterType || filterIsRead
  const unreadCount = notifications.filter((n) => !n.isRead).length
  const readCount = notifications.filter((n) => n.isRead).length

  // 分页切片
  const totalPages = Math.max(1, Math.ceil(notifications.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pagedNotifications = useMemo(
    () => notifications.slice((safePage - 1) * pageSize, safePage * pageSize),
    [notifications, safePage]
  )

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="通知列表"
        desc="查看系统通知，规则变更与数据更新提醒"
      />

      {/* 筛选栏 */}
      <motion.div
        className="bg-card border border-border rounded-xl p-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-2 mb-3 text-textSecondary">
          <Filter size={16} />
          <span className="text-sm font-medium">筛选条件</span>
          {hasFilter && (
            <button
              onClick={handleReset}
              className="ml-auto flex items-center gap-1 text-xs text-textMuted hover:text-primary transition-colors duration-200 cursor-pointer"
            >
              <RefreshCw size={12} />
              重置
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 类型 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              通知类型
            </label>
            <GroupedSelect
              value={filterType}
              onChange={(val) =>
                setFilterType(val as NotificationType | '')
              }
              fullWidth
              topOption={{ value: '', label: '全部' }}
              options={[
                { value: 'RULE_CHANGE', label: '规则变更' },
                { value: 'RANK_PUBLISH', label: '排名公布' },
                { value: 'DATA_CHANGE', label: '数据变更' },
              ]}
            />
          </div>
          {/* 已读状态 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              已读状态
            </label>
            <GroupedSelect
              value={filterIsRead}
              onChange={(val) =>
                setFilterIsRead(val as '' | 'true' | 'false')
              }
              fullWidth
              topOption={{ value: '', label: '全部' }}
              options={[
                { value: 'false', label: '未读' },
                { value: 'true', label: '已读' },
              ]}
            />
          </div>
        </div>
      </motion.div>

      {/* 通知表格 */}
      <motion.div
        className="bg-card border border-border rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              通知列表
            </h3>
            {!loading && (
              <span className="text-xs text-textMuted">
                共 {notifications.length} 条
                {unreadCount > 0 && `（${unreadCount} 条未读）`}
              </span>
            )}
          </div>
          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              disabled={loading || unreadCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              title="将当前列表中的未读通知全部标记为已读"
            >
              <CheckCheck size={14} />
              全部已读
            </button>
            <button
              onClick={handleClearRead}
              disabled={loading || readCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-textSecondary hover:text-danger hover:border-danger disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              title="清空当前列表中的已读通知"
            >
              <Trash2 size={14} />
              清空已读
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg"
              >
                <Skeleton className="h-5 w-5 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))
          ) : pagedNotifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-textMuted">
              <Bell size={32} className="mx-auto mb-2 opacity-30" />
              {hasFilter ? '当前筛选条件下暂无通知' : '暂无通知'}
            </div>
          ) : (
            pagedNotifications.map((n) => {
              const typeInfo = TYPE_MAP[n.type] ?? {
                label: n.type,
                cls: 'bg-textMuted/10 text-textMuted',
                icon: Bell,
              }
              const Icon = typeInfo.icon
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border border-border rounded-lg transition-colors duration-200 ${
                    !n.isRead ? 'bg-primary/5 border-primary/30' : ''
                  }`}
                >
                  <div className="mt-0.5">
                    <Icon size={18} className="text-textSecondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${typeInfo.cls}`}
                      >
                        {typeInfo.label}
                      </span>
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
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary/10 rounded transition-colors duration-200 cursor-pointer"
                        title="标记已读"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded transition-colors duration-200 cursor-pointer"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-3 text-sm">
            <span className="text-textSecondary">
              第 {safePage} / {totalPages} 页（共 {notifications.length} 条）
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title="上一页"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-textPrimary font-mono">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safePage >= totalPages}
                className="p-1.5 text-textSecondary hover:text-textPrimary hover:bg-surface rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                title="下一页"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
