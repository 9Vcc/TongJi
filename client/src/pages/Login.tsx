import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { getErrorMessage } from '../api'
import { Spinner } from '../components/Skeleton'

interface LocationState {
  from?: { pathname: string }
}

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError('请输入用户名和密码')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      toast.success('登录成功')
      // 登录后跳回来源页，默认进入数据看板后台
      const from = (location.state as LocationState)?.from?.pathname
      navigate(from || '/dashboard')
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface to-primary/5 dark:from-surface dark:via-surface dark:to-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-3 shadow-lg shadow-primary/20">
            <BarChart3 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-textPrimary">统计系统</h1>
          <p className="text-sm text-textSecondary mt-1">数据统计与福利管理</p>
        </motion.div>

        {/* 登录卡片 */}
        <motion.div
          className="bg-card border border-border rounded-xl p-6 shadow-sm card-hover"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 用户名 - 浮动标签 */}
            <div className="relative">
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder=" "
                className="peer w-full px-3 pt-5 pb-2 border border-border rounded-lg text-sm text-textPrimary bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                autoComplete="username"
              />
              <label
                htmlFor="username"
                className={`absolute left-3 pointer-events-none transition-all duration-200 ${
                  username
                    ? 'top-1.5 translate-y-0 text-xs text-textSecondary'
                    : 'top-1/2 -translate-y-1/2 text-sm text-textMuted'
                } peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary`}
              >
                用户名
              </label>
            </div>

            {/* 密码 - 浮动标签 */}
            <div className="relative">
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="peer w-full px-3 pt-5 pb-2 border border-border rounded-lg text-sm text-textPrimary bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                autoComplete="current-password"
              />
              <label
                htmlFor="password"
                className={`absolute left-3 pointer-events-none transition-all duration-200 ${
                  password
                    ? 'top-1.5 translate-y-0 text-xs text-textSecondary'
                    : 'top-1/2 -translate-y-1/2 text-sm text-textMuted'
                } peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary`}
              >
                密码
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-danger/10 text-danger text-sm rounded-lg">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {loading ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
