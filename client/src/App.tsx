import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import PageTransition from './components/PageTransition'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DataEntry from './pages/DataEntry'
import Ranking from './pages/Ranking'
import Personnel from './pages/Personnel'
import Settings from './pages/Settings'
import AccountsPage from './pages/settings/Accounts'
import BranchesPage from './pages/settings/Branches'
import NotificationsPage from './pages/settings/Notifications'
import DataHistoryPage from './pages/settings/DataHistory'
import LoginRecordsPage from './pages/settings/LoginRecords'
import PublicRanking from './pages/PublicRanking'

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
    return <Navigate to="/login" state={{ from: location }} replace />
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

function AppRoutes() {
  return (
    <Routes>
      {/* 默认首页：公开排名（无需登录，所有人可访问） */}
      <Route path="/" element={<PublicRanking />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/data" element={<DataEntry />} />
        <Route path="/ranking" element={<Ranking />} />
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
  )
}

function App() {
  return <AppRoutes />
}

export default App
