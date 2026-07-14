import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  /** 带圆形扩散动画的主题切换（基于点击位置） */
  themeAnimation: (e: { clientX: number; clientY: number }) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'theme'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'auto'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored
  }
  return 'auto'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const stored = readStoredTheme()
    return stored === 'auto' ? getSystemTheme() : stored
  })

  // 应用主题到 document
  useEffect(() => {
    const resolved = theme === 'auto' ? getSystemTheme() : theme
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [theme])

  // 监听系统主题变化（仅当 theme 为 auto 时生效）
  useEffect(() => {
    if (theme !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      // 只在明暗间切换，不切换 auto 模式
      const current = prev === 'auto' ? getSystemTheme() : prev
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  // 临时禁用全局 transition（避免主题切换时元素逐个变色的闪烁感）
  const disableTransitions = useCallback(() => {
    document.body.classList.add('theme-change')
  }, [])

  const enableTransitions = useCallback(() => {
    // 延迟移除，等待 View Transition 动画完成
    setTimeout(() => document.body.classList.remove('theme-change'), 300)
  }, [])

  // 带圆形扩散动画的主题切换（基于点击位置）
  const themeAnimation = useCallback((e: { clientX: number; clientY: number }) => {
    const x = e.clientX
    const y = e.clientY
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    document.documentElement.style.setProperty('--x', `${x}px`)
    document.documentElement.style.setProperty('--y', `${y}px`)
    document.documentElement.style.setProperty('--r', `${endRadius}px`)

    // 切换前禁用全局 transition，避免闪烁
    disableTransitions()

    if (document.startViewTransition) {
      document.startViewTransition(() => toggleTheme())
      // View Transition 动画结束后恢复 transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => enableTransitions())
      })
    } else {
      toggleTheme()
      // 降级：下一帧恢复
      requestAnimationFrame(() => enableTransitions())
    }
  }, [toggleTheme, disableTransitions, enableTransitions])

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme, themeAnimation }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用')
  }
  return ctx
}
