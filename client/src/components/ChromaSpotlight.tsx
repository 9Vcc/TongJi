import { useRef, useEffect, useCallback, type ReactNode } from 'react'
import { gsap } from 'gsap'
import './ChromaSpotlight.css'

interface ChromaSpotlightProps {
  children: ReactNode
  className?: string
  /** 聚光灯半径（px），默认 300 */
  radius?: number
  /** 光标跟随动画时长（秒），默认 0.45 */
  damping?: number
  /** 鼠标离开后灰度淡入时长（秒），默认 0.6 */
  fadeOut?: number
  /** GSAP 缓动函数，默认 'power3.out' */
  ease?: string
}

/**
 * ChromaSpotlight 聚光灯灰度容器：
 * 鼠标移动时聚光灯内的卡片保持彩色，外围变为灰度
 * 可包裹任意子元素网格，适配明暗模式
 */
const ChromaSpotlight = ({
  children,
  className = '',
  radius = 300,
  damping = 0.45,
  fadeOut = 0.6,
  ease = 'power3.out',
}: ChromaSpotlightProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null)
  const setX = useRef<((v: number) => void) | null>(null)
  const setY = useRef<((v: number) => void) | null>(null)
  const pos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    setX.current = gsap.quickSetter(el, '--x', 'px') as (v: number) => void
    setY.current = gsap.quickSetter(el, '--y', 'px') as (v: number) => void
    const { width, height } = el.getBoundingClientRect()
    pos.current = { x: width / 2, y: height / 2 }
    setX.current(pos.current.x)
    setY.current(pos.current.y)
  }, [])

  const moveTo = useCallback(
    (x: number, y: number) => {
      gsap.to(pos.current, {
        x,
        y,
        duration: damping,
        ease,
        onUpdate: () => {
          setX.current?.(pos.current.x)
          setY.current?.(pos.current.y)
        },
        overwrite: true,
      })
    },
    [damping, ease],
  )

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      moveTo(e.clientX - r.left, e.clientY - r.top)
      if (fadeRef.current) {
        gsap.to(fadeRef.current, { opacity: 0, duration: 0.25, overwrite: true })
      }
    },
    [moveTo],
  )

  const handleLeave = useCallback(() => {
    if (fadeRef.current) {
      gsap.to(fadeRef.current, {
        opacity: 1,
        duration: fadeOut,
        overwrite: true,
      })
    }
  }, [fadeOut])

  return (
    <div
      ref={rootRef}
      className={`chroma-spotlight ${className}`.trim()}
      style={{ '--r': `${radius}px` } as React.CSSProperties}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {children}
      <div className="chroma-spotlight-overlay" aria-hidden="true" />
      <div ref={fadeRef} className="chroma-spotlight-fade" aria-hidden="true" />
    </div>
  )
}

export default ChromaSpotlight
