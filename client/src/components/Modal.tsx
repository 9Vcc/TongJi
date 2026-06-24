import { type ReactNode, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // 锁定背景滚动 + ESC 关闭 + 焦点管理
  useEffect(() => {
    if (!open) return

    document.body.style.overflow = 'hidden'
    previouslyFocused.current = document.activeElement as HTMLElement | null

    // 聚焦到弹窗容器
    const focusTimer = setTimeout(() => {
      dialogRef.current?.focus()
    }, 0)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // 焦点陷阱：Tab 键循环聚焦在弹窗内
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(focusTimer)
      // 恢复之前的焦点
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            tabIndex={-1}
            className={`relative bg-card rounded-lg border border-border w-full ${width} max-h-[90vh] flex flex-col shadow-xl focus:outline-none`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {title && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3
                  id="modal-title"
                  className="text-base font-semibold text-textPrimary"
                >
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  aria-label="关闭弹窗"
                  className="p-1 text-textMuted hover:text-textPrimary hover:bg-surface rounded-lg transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
