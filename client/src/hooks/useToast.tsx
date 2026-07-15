import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      // 空消息静默跳过（用于限流等不需要提示的场景）
      if (!message.trim()) return
      const id = ++toastId
      setToasts((prev) => [...prev, { id, type, message }])
      setTimeout(() => remove(id), 3000)
    },
    [remove]
  )

  const success = useCallback((m: string) => show(m, 'success'), [show])
  const error = useCallback((m: string) => show(m, 'error'), [show])
  const info = useCallback((m: string) => show(m, 'info'), [show])

  // 使用 useMemo 稳定 Context value 引用，避免 Provider 重新渲染时导致消费者不必要的重渲染
  const value = useMemo(
    () => ({ show, success, error, info }),
    [show, success, error, info]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onClose={() => remove(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({
  toast,
  onClose,
}: {
  toast: ToastItem
  onClose: () => void
}) {
  const config = {
    success: {
      icon: CheckCircle,
      // 用深色背景 + 白字，确保对比度
      bg: 'bg-[#0ea5a0]',
      text: 'text-white',
    },
    error: {
      icon: AlertCircle,
      bg: 'bg-[#e53935]',
      text: 'text-white',
    },
    info: {
      icon: Info,
      bg: 'bg-[#4a72e8]',
      text: 'text-white',
    },
  }[toast.type]

  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-center gap-2 px-4 py-3 rounded-lg ${config.bg} ${config.text} min-w-[260px] max-w-[400px] shadow-xl ring-1 ring-black/10`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button onClick={onClose} className="opacity-80 hover:opacity-100 shrink-0 cursor-pointer">
        <X size={16} />
      </button>
    </motion.div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast 必须在 ToastProvider 内使用')
  }
  return ctx
}
