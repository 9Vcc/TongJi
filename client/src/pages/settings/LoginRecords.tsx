import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { LogIn, Filter, RefreshCw } from 'lucide-react'
import {
  loginRecordsApi,
  accountsApi,
  getErrorMessage,
} from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { Skeleton } from '../../components/Skeleton'
import SubPageHeader from '../../components/SubPageHeader'
import SearchableSelect from '../../components/SearchableSelect'
import { formatDateTime, getRoleText } from '../../utils'
import type { LoginRecord, User } from '../../types'

/**
 * 简易解析 User-Agent：提取浏览器与操作系统
 */
function parseUserAgent(ua: string | null): string {
  if (!ua) return '-'
  let os = '未知设备'
  if (/Windows NT 10/.test(ua)) os = 'Windows'
  else if (/Windows NT/.test(ua)) os = 'Windows'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = '未知浏览器'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'
  else if (/MSIE|Trident/.test(ua)) browser = 'IE'

  return `${os} · ${browser}`
}

export default function LoginRecordsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isHuizhang = user?.role === 'HUIZHANG'

  const [records, setRecords] = useState<LoginRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<User[]>([])

  // 筛选条件
  const [filterAccountId, setFilterAccountId] = useState('')
  const [filterDate, setFilterDate] = useState('')

  const loadRecords = async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof loginRecordsApi.list>[0] = {}
      if (filterAccountId) params.accountId = Number(filterAccountId)
      if (filterDate) params.date = filterDate
      params.limit = 200
      const list = await loginRecordsApi.list(params)
      setRecords(list)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载账户列表
  useEffect(() => {
    if (!isHuizhang) return
    accountsApi.list().then(setAccounts).catch(() => {})
  }, [isHuizhang])

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (!isHuizhang) return
    loadRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAccountId, filterDate])

  const handleReset = () => {
    setFilterAccountId('')
    setFilterDate('')
  }

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: String(a.id),
        label: `${a.username}（${getRoleText(a.role)}）`,
      })),
    [accounts]
  )

  if (!isHuizhang) {
    return (
      <div className="py-12 text-center text-sm text-textMuted">
        无权访问此页面
      </div>
    )
  }

  const hasFilter = filterAccountId || filterDate

  return (
    <div className="space-y-5">
      <SubPageHeader
        title="登录记录"
        desc="查看账户登录的设备与时间，仅会长可见"
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
          {/* 账户 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              账户
            </label>
            <SearchableSelect
              value={filterAccountId}
              onChange={setFilterAccountId}
              options={accountOptions}
              placeholder="搜索账户..."
              emptyText="无匹配账户"
            />
          </div>

          {/* 登录日期 */}
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              登录日期
            </label>
            <div className="relative">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200 cursor-pointer"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-textMuted hover:text-textPrimary transition-colors duration-200"
                  title="清除日期"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 登录记录表格 */}
      <motion.div
        className="bg-card border border-border rounded-xl p-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LogIn size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-textPrimary">
              登录记录
            </h3>
            {!loading && (
              <span className="text-xs text-textMuted">
                共 {records.length} 条
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr className="text-left text-textSecondary">
                <th className="px-3 py-2 font-medium">登录时间</th>
                <th className="px-3 py-2 font-medium">账户</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">设备 / 浏览器</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-12 text-center text-textMuted"
                  >
                    {hasFilter ? '当前筛选条件下暂无记录' : '暂无登录记录'}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-border last:border-0 hover:bg-surface transition-colors duration-200"
                  >
                    <td className="px-3 py-2 text-textSecondary whitespace-nowrap font-mono text-xs">
                      {formatDateTime(record.loginTime)}
                    </td>
                    <td className="px-3 py-2 text-textPrimary font-medium">
                      {record.account.username}
                    </td>
                    <td className="px-3 py-2 text-textSecondary">
                      {getRoleText(record.account.role)}
                    </td>
                    <td className="px-3 py-2 text-textSecondary text-xs">
                      {parseUserAgent(record.userAgent)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
