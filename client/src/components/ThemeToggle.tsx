import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useTheme, type Theme } from '../hooks/useTheme'

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '明亮', icon: Sun },
  { value: 'dark', label: '暗黑', icon: Moon },
  { value: 'auto', label: '自动', icon: Monitor },
]

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const CurrentIcon =
    options.find((o) => o.value === theme)?.icon ?? Monitor

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label="切换主题"
        aria-expanded={open}
        title={`当前主题：${
          options.find((o) => o.value === theme)?.label
        }（实际：${resolvedTheme === 'dark' ? '暗黑' : '明亮'}）`}
      >
        <CurrentIcon size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top right' }}
          >
          {options.map((opt) => {
            const Icon = opt.icon
            const active = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => {
                  setTheme(opt.value)
                  setOpen(false)
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  active
                    ? 'text-primary bg-primary/10'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-surface'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1 text-left">{opt.label}</span>
                {active && <Check size={14} />}
              </button>
            )
          })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
