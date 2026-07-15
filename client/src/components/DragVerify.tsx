import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ChevronsRight, Check } from 'lucide-react'

export interface DragVerifyHandle {
  reset: () => void
}

interface DragVerifyProps {
  value: boolean
  onChange: (value: boolean) => void
  height?: number
  text?: string
  successText?: string
  background?: string
  progressBarBg?: string
  completedBg?: string
  handlerBg?: string
  textColor?: string
}

/** 滑块拖拽验证组件：拖动滑块到末端完成验证，未验证时文字流光高亮 */
const DragVerify = forwardRef<DragVerifyHandle, DragVerifyProps>(function DragVerify(
  {
    value,
    onChange,
    height = 42,
    text = '按住滑块拖动验证',
    successText = '验证通过',
    background,
    progressBarBg,
    completedBg,
    handlerBg,
    textColor,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const [isMoving, setIsMoving] = useState(false)
  const [offset, setOffset] = useState(0)
  const startXRef = useRef(0)

  // 受控重置：外部 value 变 false 时归零
  useEffect(() => {
    if (!value) setOffset(0)
  }, [value])

  // 组件挂载后设置流光动画的 CSS 变量（基于容器宽度）
  useEffect(() => {
    if (!containerRef.current || !messageRef.current) return
    const width = containerRef.current.offsetWidth / 2
    messageRef.current.style.setProperty('--width', `${width}px`)
    messageRef.current.style.setProperty('--pwidth', `${-width}px`)
  }, [])

  useImperativeHandle(ref, () => ({
    reset: () => {
      setOffset(0)
      onChange(false)
    },
  }))

  const handleStart = (clientX: number) => {
    if (value) return
    startXRef.current = clientX - offset
    setIsMoving(true)
  }

  const handleMove = (clientX: number) => {
    if (!isMoving || value || !containerRef.current) return
    const max = containerRef.current.offsetWidth - height
    let next = clientX - startXRef.current
    if (next < 0) next = 0
    if (next > max) next = max
    setOffset(next)
    if (next >= max) {
      onChange(true)
      setIsMoving(false)
    }
  }

  const handleEnd = () => {
    if (!isMoving || value) return
    setIsMoving(false)
    if (containerRef.current) {
      const max = containerRef.current.offsetWidth - height
      if (offset < max) {
        setOffset(0)
      }
    }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    handleStart(e.clientX)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX)
  }

  useEffect(() => {
    if (!isMoving) return
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX)
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
      handleMove(e.touches[0].clientX)
    }
    const onUp = () => handleEnd()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMoving, offset, value])

  return (
    <div
      ref={containerRef}
      className="drag-verify"
      style={{
        height: `${height}px`,
        lineHeight: `${height}px`,
        background: value
          ? (completedBg ?? 'color-mix(in srgb, var(--color-primary) 15%, transparent)')
          : (background ?? 'color-mix(in srgb, var(--color-border) 50%, transparent)'),
        borderRadius: `${height / 2}px`,
      }}
    >
      {/* 进度条：宽度限制为 offset + 滑块半径，防止超出容器圆角 */}
      <div
        className="dv-progress-bar"
        style={{
          width: `${offset + height / 2}px`,
          maxWidth: '100%',
          height: `${height}px`,
          background: value
            ? (completedBg ?? 'var(--color-primary)')
            : (progressBarBg ?? 'color-mix(in srgb, var(--color-primary) 70%, transparent)'),
          borderRadius: `${height / 2}px 0 0 ${height / 2}px`,
          transition: isMoving ? 'none' : 'width 0.3s ease',
        }}
      />

      {/* 提示文本：未验证时流光动画，验证通过后静止 */}
      <div
        ref={messageRef}
        className={`dv-text ${value ? 'dv-text-static' : 'dv-text-slide'}`}
        style={{
          height: `${height}px`,
          lineHeight: `${height}px`,
          color: value
            ? '#ffffff'
            : (textColor ?? 'var(--color-text-muted)'),
          fontSize: '13px',
        }}
      >
        {value ? successText : text}
      </div>

      {/* 滑块 */}
      <div
        className="dv-handler"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          width: `${height}px`,
          height: `${height}px`,
          background: handlerBg ?? 'var(--color-card)',
          transform: `translateX(${offset}px)`,
          transition: isMoving ? 'none' : 'transform 0.3s ease',
          borderRadius: '50%',
        }}
      >
        {value ? (
          <Check size={18} className="text-primary" />
        ) : (
          <ChevronsRight size={18} className="text-textMuted" />
        )}
      </div>
    </div>
  )
})

export default DragVerify
