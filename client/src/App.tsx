import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import PageTransition from './components/PageTransition'
import { Spinner } from './components/Skeleton'

// 公开页：PublicRanking + Login
const PublicRanking = lazy(() => import('./pages/PublicRanking'))
const Login = lazy(() => import('./pages/Login'))

// 后台主体
const Dashboard = lazy(() => import('./pages/Dashboard'))
const DataEntry = lazy(() => import('./pages/DataEntry'))
const Personnel = lazy(() => import('./pages/Personnel'))
const Settings = lazy(() => import('./pages/Settings'))

// 设置子页
const AccountsPage = lazy(() => import('./pages/settings/Accounts'))
const BranchesPage = lazy(() => import('./pages/settings/Branches'))
const NotificationsPage = lazy(() => import('./pages/settings/Notifications'))
const DataHistoryPage = lazy(() => import('./pages/settings/DataHistory'))
const LoginRecordsPage = lazy(() => import('./pages/settings/LoginRecords'))

/** 路由级懒加载 fallback：居中旋转动画 */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  )
}

/**
 * 受保护的布局路由：负责认证校验 + 渲染常驻 Layout
 * 使用 <Outlet /> 渲染子路由，Layout 只挂载一次，
 * 避免路由切换时 sidebarCollapsed 等状态丢失
 */
function ProtectedLayout() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-sm text-textMuted">加载中...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <PageTransition key={location.pathname}>
          <Outlet />
        </PageTransition>
      </AnimatePresence>
    </Layout>
  )
}

/**
 * 公开页面布局：为 / 和 /login 路由切换提供过渡动画
 */
function PublicLayout() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname}>
        <Outlet />
      </PageTransition>
    </AnimatePresence>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* 公开页面：排名 + 登录，带过渡动画 */}
        <Route element={<PublicLayout />}>
          {/* 默认首页：公开排名（无需登录，所有人可访问） */}
          <Route path="/" element={<PublicRanking />} />
          <Route path="/login" element={<Login />} />
        </Route>
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/data" element={<DataEntry />} />
          <Route path="/personnel" element={<Personnel />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/accounts" element={<AccountsPage />} />
          <Route path="/settings/branches" element={<BranchesPage />} />
          <Route path="/settings/notifications" element={<NotificationsPage />} />
          <Route path="/settings/history" element={<DataHistoryPage />} />
          <Route path="/settings/login-records" element={<LoginRecordsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return <AppRoutes />
}

export default App
