import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * 外观配置：主色预设、边框/阴影模式、动态圆角
 * 参考 art-design-pro 的设置面板设计，独立于 useTheme（明暗模式）
 */

// 7 色预设（与 art-design-pro systemMainColor 对齐）
export const PRIMARY_PRESETS = [
  { key: 'blue', label: '蓝色', value: '#5d87ff', hover: '#4a72e8' },
  { key: 'purple', label: '紫色', value: '#b48df3', hover: '#9d6ee8' },
  { key: 'skyblue', label: '亮蓝', value: '#1d84ff', hover: '#1670db' },
  { key: 'green', label: '绿色', value: '#60c041', hover: '#4ea034' },
  { key: 'cyan', label: '青色', value: '#38c0fc', hover: '#1da8e8' },
  { key: 'orange', label: '橙色', value: '#f9901f', hover: '#db7a0a' },
  { key: 'pink', label: '粉色', value: '#ff80c8', hover: '#e85fae' },
] as const

export type PrimaryPresetKey = (typeof PRIMARY_PRESETS)[number]['key']

type BoxMode = 'border-mode' | 'shadow-mode'

interface AppearanceContextValue {
  primaryColor: PrimaryPresetKey
  setPrimaryColor: (key: PrimaryPresetKey) => void
  primaryPresets: typeof PRIMARY_PRESETS
  /** 当前主色 hex 值 */
  primaryValue: string
  /** 当前主色 hover hex 值 */
  primaryHoverValue: string
  boxMode: BoxMode
  setBoxMode: (mode: BoxMode) => void
  toggleBoxMode: () => void
  /** 圆角系数（0 ~ 2，默认 0.75） */
  customRadius: number
  setCustomRadius: (v: number) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

const PRIMARY_KEY = 'appearance:primary'
const BOX_MODE_KEY = 'appearance:box-mode'
const RADIUS_KEY = 'appearance:radius'

function readPrimary(): PrimaryPresetKey {
  if (typeof window === 'undefined') return 'blue'
  const stored = localStorage.getItem(PRIMARY_KEY)
  if (stored && PRIMARY_PRESETS.some((p) => p.key === stored)) return stored as PrimaryPresetKey
  return 'blue'
}

function readBoxMode(): BoxMode {
  if (typeof window === 'undefined') return 'border-mode'
  const stored = localStorage.getItem(BOX_MODE_KEY)
  return stored === 'shadow-mode' ? 'shadow-mode' : 'border-mode'
}

function readRadius(): number {
  if (typeof window === 'undefined') return 0.75
  const stored = localStorage.getItem(RADIUS_KEY)
  const n = stored ? Number(stored) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 2) return 0.75
  return n
}

/** 将 hex 转 oklch 字符串（用于更精准的色彩插值） */
function hexToOklch(hex: string): string {
  // 简化：直接返回 hex，CSS 变量接受任意合法颜色
  return hex
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [primaryColor, setPrimaryColorState] = useState<PrimaryPresetKey>(() => readPrimary())
  const [boxMode, setBoxModeState] = useState<BoxMode>(() => readBoxMode())
  const [customRadius, setCustomRadiusState] = useState<number>(() => readRadius())

  // 应用主色到 :root CSS 变量
  const applyPrimary = useCallback((key: PrimaryPresetKey) => {
    const preset = PRIMARY_PRESETS.find((p) => p.key === key) ?? PRIMARY_PRESETS[0]
    const root = document.documentElement
    root.style.setProperty('--art-primary', hexToOklch(preset.value))
    root.style.setProperty('--art-primary-hover', hexToOklch(preset.hover))
    root.style.setProperty('--art-info', hexToOklch(preset.value))
    // 通知全局聚光灯等组件主色已变化
    window.dispatchEvent(new CustomEvent('theme:primary-change', { detail: { hex: preset.value } }))
  }, [])

  // 应用边框/阴影模式
  const applyBoxMode = useCallback((mode: BoxMode) => {
    document.documentElement.setAttribute('data-box-mode', mode)
  }, [])

  // 应用圆角系数
  const applyRadius = useCallback((v: number) => {
    document.documentElement.style.setProperty('--custom-radius', `${v}rem`)
  }, [])

  // 初始化应用一次
  useEffect(() => {
    applyPrimary(primaryColor)
    applyBoxMode(boxMode)
    applyRadius(customRadius)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setPrimaryColor = useCallback((key: PrimaryPresetKey) => {
    localStorage.setItem(PRIMARY_KEY, key)
    setPrimaryColorState(key)
    applyPrimary(key)
  }, [applyPrimary])

  const setBoxMode = useCallback((mode: BoxMode) => {
    localStorage.setItem(BOX_MODE_KEY, mode)
    setBoxModeState(mode)
    applyBoxMode(mode)
  }, [applyBoxMode])

  const toggleBoxMode = useCallback(() => {
    setBoxModeState((prev) => {
      const next: BoxMode = prev === 'border-mode' ? 'shadow-mode' : 'border-mode'
      localStorage.setItem(BOX_MODE_KEY, next)
      applyBoxMode(next)
      return next
    })
  }, [applyBoxMode])

  const setCustomRadius = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(2, v))
    localStorage.setItem(RADIUS_KEY, String(clamped))
    setCustomRadiusState(clamped)
    applyRadius(clamped)
  }, [applyRadius])

  const preset = PRIMARY_PRESETS.find((p) => p.key === primaryColor) ?? PRIMARY_PRESETS[0]

  return (
    <AppearanceContext.Provider
      value={{
        primaryColor,
        setPrimaryColor,
        primaryPresets: PRIMARY_PRESETS,
        primaryValue: preset.value,
        primaryHoverValue: preset.hover,
        boxMode,
        setBoxMode,
        toggleBoxMode,
        customRadius,
        setCustomRadius,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext)
  if (!ctx) {
    throw new Error('useAppearance 必须在 AppearanceProvider 内使用')
  }
  return ctx
}
