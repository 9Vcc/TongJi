import { useEffect } from 'react'
import { X, Check, Sun, Moon, Monitor, RotateCcw } from 'lucide-react'
import { useAppearance } from '../../hooks/useAppearance'
import { useTheme, type Theme } from '../../hooks/useTheme'
import { useToast } from '../../hooks/useToast'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

/**
 * 设置面板（外观配置抽屉）
 * 参考 art-design-pro 的 art-settings-panel 设计：
 *  - 主题模式（亮/暗/自动）
 *  - 系统主题色（7 色预设）
 *  - 盒子样式（边框模式 / 阴影模式）
 *  - 自定义圆角（滑块调节）
 *  - 重置按钮
 */
export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const {
    primaryColor,
    setPrimaryColor,
    primaryPresets,
    boxMode,
    setBoxMode,
    customRadius,
    setCustomRadius,
  } = useAppearance()
  const { theme, setTheme } = useTheme()
  const { show } = useToast()

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 打开时锁定 body 滚动
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const themeOptions: Array<{ key: Theme; label: string; icon: typeof Sun }> = [
    { key: 'light', label: '明亮', icon: Sun },
    { key: 'dark', label: '暗黑', icon: Moon },
    { key: 'auto', label: '跟随系统', icon: Monitor },
  ]

  const boxModeOptions: Array<{ key: typeof boxMode; label: string }> = [
    { key: 'border-mode', label: '边框模式' },
    { key: 'shadow-mode', label: '阴影模式' },
  ]

  const handleReset = () => {
    setPrimaryColor('blue')
    setBoxMode('border-mode')
    setCustomRadius(0.75)
    setTheme('auto')
    show('已重置外观配置', 'success')
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 抽屉（右侧滑入） */}
      <aside
        className="absolute right-0 top-0 h-full w-[300px] max-w-[85vw] bg-card/80 backdrop-blur-xl border-l border-border shadow-2xl flex flex-col animate-settings-slide-in"
        role="dialog"
        aria-modal="true"
        aria-label="外观设置"
      >
        {/* 头部：标题 + 关闭按钮 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-textPrimary">外观配置</h2>
          <button
            onClick={onClose}
            className="flex-cc w-7 h-7 rounded-md text-textSecondary hover:text-textPrimary hover:bg-g-300/60 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="关闭设置面板"
          >
            <X size={18} />
          </button>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 pb-6">
          {/* ========== 主题模式 ========== */}
          <SectionTitle>主题模式</SectionTitle>
          <div className="grid grid-cols-3 gap-2.5">
            {themeOptions.map((opt) => {
              const Icon = opt.icon
              const active = theme === opt.key
              // 预览色块：亮=白底，暗=黑底，系统=半白半黑
              const previewBg =
                opt.key === 'light'
                  ? 'linear-gradient(135deg, #ffffff 50%, #f2f4f5 100%)'
                  : opt.key === 'dark'
                    ? 'linear-gradient(135deg, #161618 50%, #070707 100%)'
                    : 'linear-gradient(135deg, #ffffff 50%, #161618 50%)'
              return (
                <button
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className={`flex flex-col items-center gap-2 h-[80px] rounded-lg border-2 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 overflow-hidden ${
                    active
                      ? 'border-primary bg-primary/8 text-primary'
                      : 'border-border text-textSecondary hover:border-primary/40 hover:bg-surface'
                  }`}
                >
                  {/* 预览色块 */}
                  <div
                    className="w-full h-7 border-b border-border/30 flex items-center justify-center"
                    style={{ background: previewBg }}
                  >
                    <Icon
                      size={14}
                      className={opt.key === 'dark' ? 'text-white' : 'text-textSecondary'}
                    />
                  </div>
                  <span className="text-xs pb-1">{opt.label}</span>
                </button>
              )
            })}
          </div>

          {/* ========== 系统主题色 ========== */}
          <SectionTitle>系统主题色</SectionTitle>
          <div className="flex flex-wrap gap-4">
            {primaryPresets.map((preset) => {
              const active = primaryColor === preset.key
              return (
                <button
                  key={preset.key}
                  onClick={() => setPrimaryColor(preset.key)}
                  className="flex-cc w-[23px] h-[23px] rounded-full cursor-pointer transition-all duration-200 hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:ring-primary/60"
                  style={{ backgroundColor: preset.value }}
                  aria-label={`${preset.label}主题色`}
                  title={preset.label}
                >
                  {active && <Check size={14} className="text-white" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
          {/* 当前选中色名 */}
          <p className="mt-3 text-xs text-textMuted text-center">
            当前：{primaryPresets.find((p) => p.key === primaryColor)?.label ?? '蓝色'}
          </p>

          {/* ========== 盒子样式 ========== */}
          <SectionTitle>盒子样式</SectionTitle>
          <div className="flex-cb p-1 rounded-lg bg-g-200">
            {boxModeOptions.map((opt) => {
              const active = boxMode === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => setBoxMode(opt.key)}
                  className={`flex-1 h-8 text-sm text-center select-none rounded-md transition-all duration-200 cursor-pointer focus:outline-none ${
                    active
                      ? 'text-textPrimary bg-card shadow-sm dark:text-white'
                      : 'text-textSecondary hover:text-textPrimary hover:bg-black/[0.04] dark:hover:bg-black/20'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* ========== 自定义圆角 ========== */}
          <SectionTitle>自定义圆角</SectionTitle>
          <div className="flex-cb gap-3">
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={customRadius}
              onChange={(e) => setCustomRadius(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-g-300 settings-range-input"
              aria-label="圆角系数"
            />
            <span className="w-12 text-right text-sm tabular-nums text-textPrimary">
              {customRadius.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 flex-cb text-xs text-textMuted">
            <span>锐利</span>
            <span>圆润</span>
          </div>

          {/* ========== 重置按钮 ========== */}
          <div className="mt-10 pt-5 border-t border-border">
            <button
              onClick={handleReset}
              className="w-full h-8 flex-cc gap-2 text-sm rounded-md border border-danger/50 text-danger hover:bg-danger/10 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <RotateCcw size={14} />
              <span>重置外观配置</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

/** 分区标题：左右两条细线 + 居中文字（参考 art-design-pro SectionTitle） */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="relative mt-7 mb-5 text-sm text-center text-textPrimary">
      <span className="relative z-10 px-3 bg-card">{children}</span>
      <span className="absolute top-1/2 left-0 right-0 h-px bg-g-300 -z-0" />
    </p>
  )
}
