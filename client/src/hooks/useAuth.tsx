import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '../types'
import { authApi } from '../api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await authApi.getMe()
      setUser(me)
    } catch {
      localStorage.removeItem('token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password)
    localStorage.setItem('token', res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  // 使用 useMemo 稳定 Context value 引用，避免不必要的消费者重渲染
  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}
