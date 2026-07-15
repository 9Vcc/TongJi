import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, LogIn, AlertCircle, Home, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useTheme } from '../hooks/useTheme'
import { getErrorMessage } from '../api'
import { Spinner } from '../components/Skeleton'
import DragVerify, { type DragVerifyHandle } from '../components/DragVerify'
import LoginIllustration from '../components/LoginIllustration'
import Silk from '../components/Silk'
import ThemeToggle from '../components/ThemeToggle'
import ProfileCardStyleWrapper from '../components/ProfileCard'
import GlobalSpotlight from '../components/GlobalSpotlight'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPassing, setIsPassing] = useState(false)
  const [clickPass, setClickPass] = useState(false)
  const dragVerifyRef = useRef<DragVerifyHandle>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError('请输入用户名和密码')
      return
    }
    if (!isPassing) {
      setClickPass(true)
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      toast.success('登录成功')
      navigate('/dashboard')
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      // 登录失败后重置滑块验证
      dragVerifyRef.current?.reset()
      setIsPassing(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page flex w-full h-screen">
      {/* 全局聚光灯：跟随鼠标照亮附近卡片 */}
      <GlobalSpotlight />

      {/* Silk 丝滑 Shader 动画背景（全屏覆盖） */}
      <div className="silk-bg">
        <Silk
          speed={4.4}
          scale={0.8}
          color={resolvedTheme === 'dark' ? '#7B7481' : '#A8C5F0'}
          noiseIntensity={0.3}
          rotation={0}
        />
      </div>

      {/* 左侧：品牌展示区 */}
      <div className="login-left-view">
        {/* Logo */}
        <div className="login-logo">
          <div className="w-10 h-10 rounded-custom bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <BarChart3 size={22} className="text-white" />
          </div>
          <h1 className="login-logo-title">统计系统</h1>
        </div>

        {/* 中心 SVG 插画 */}
        <div className="login-left-img">
          <LoginIllustration />
        </div>

        {/* 底部标语 */}
        <div className="login-text-wrap">
          <h2>数据统计与福利管理</h2>
          <p>高效、精准的数据录入与排行看板</p>
        </div>
      </div>

      {/* 右侧：登录表单区 */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        {/* 右上角工具栏 */}
        <div className="auth-top-bar">
          <button
            onClick={() => navigate('/')}
            aria-label="返回首页"
            className="auth-top-btn"
          >
            <Home size={18} />
            <span>首页</span>
          </button>
          {/* 主题切换按钮 */}
          <ThemeToggle />
        </div>

        {/* 表单卡片 */}
        <div className="auth-right-wrap w-full max-w-[400px]">
          <ProfileCardStyleWrapper
            className="animate-form-enter"
            enableTilt
            behindGlowEnabled
            behindGlowSize="55%"
          >
            <div className="form">
            <h3 className="form-title">欢迎回来</h3>
            <p className="form-subtitle">请登录您的账户以继续</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 用户名 */}
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=" "
                  className="login-input peer w-full px-3 pt-4 pb-3 border border-border rounded-custom-sm text-sm text-textPrimary bg-card focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                  autoComplete="username"
                />
                <label
                  htmlFor="username"
                  className="absolute left-3 pointer-events-none transition-all duration-200 peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary"
                  style={username ? { top: '4px', transform: 'translateY(0)', fontSize: '12px', color: 'var(--color-text-secondary)' } : { top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'var(--color-text-muted)' }}
                >
                  用户名
                </label>
              </div>

              {/* 密码 */}
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  className="login-input peer w-full px-3 pt-4 pb-3 pr-10 border border-border rounded-custom-sm text-sm text-textPrimary bg-card focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
                  autoComplete="current-password"
                />
                <label
                  htmlFor="password"
                  className="absolute left-3 pointer-events-none transition-all duration-200 peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary"
                  style={password ? { top: '4px', transform: 'translateY(0)', fontSize: '12px', color: 'var(--color-text-secondary)' } : { top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'var(--color-text-muted)' }}
                >
                  密码
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-primary transition-colors duration-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* 滑块验证 */}
              <div className="pt-2">
                <DragVerify
                  ref={dragVerifyRef}
                  value={isPassing}
                  onChange={setIsPassing}
                />
                <p
                  className="text-xs text-danger mt-1.5 transition-all duration-300"
                  style={{ opacity: !isPassing && clickPass ? 1 : 0 }}
                >
                  请先完成滑块验证
                </p>
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-danger/10 text-danger text-sm rounded-custom-sm animate-fade-in">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 登录按钮 */}
              <button
                type="submit"
                disabled={loading}
                className="login-submit-btn w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {loading ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <LogIn size={16} />
                )}
                {loading ? '登录中...' : '登录'}
              </button>
            </form>
            </div>
          </ProfileCardStyleWrapper>
        </div>
      </div>
    </div>
  )
}
