import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
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
import type { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
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

  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Dashboard />
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/data"
          element={
            <ProtectedRoute>
              <PageTransition>
                <DataEntry />
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ranking"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Ranking />
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/personnel"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Personnel />
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <PageTransition>
                <Settings />
              </PageTransition>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function App() {
  return <AppRoutes />
}

export default App
