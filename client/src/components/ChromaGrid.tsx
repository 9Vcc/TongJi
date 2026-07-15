import { useRef, useEffect, useCallback, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ChevronRight } from 'lucide-react'
import './ChromaGrid.css'

/** ChromaGrid 数据项（图片模式） */
export interface ChromaItem {
  image: string
  title: string
  subtitle?: string
  handle?: string
  location?: string
  borderColor?: string
  gradient?: string
  url?: string
}

/** ChromaGrid 图标模式数据项 */
export interface ChromaIconItem {
  title: string
  subtitle?: string
  icon: ReactNode
  borderColor?: string
  gradient?: string
  to?: string
}

interface ChromaGridBaseProps {
  className?: string
  radius?: number
  damping?: number
  fadeOut?: number
  ease?: string
}

interface ChromaGridImageProps extends ChromaGridBaseProps {
  items: ChromaItem[]
  columns?: number
  mode?: 'image'
  children?: never
}

interface ChromaGridIconProps extends ChromaGridBaseProps {
  items: ChromaIconItem[]
  columns?: number
  mode: 'icon'
  onCardClick?: (item: ChromaIconItem) => void
  children?: never
}

type ChromaGridProps = ChromaGridImageProps | ChromaGridIconProps

/**
 * ChromaGrid 色彩网格：鼠标聚光灯效果，聚光灯内卡片彩色，外围灰度
 * 支持图片模式（mode='image'）和图标模式（mode='icon'）
 * 灵感来自 React Bits ChromaGrid 组件，适配项目主题变量与明暗模式
 */
const ChromaGrid = (props: ChromaGridProps) => {
  const {
    items,
    className = '',
    radius = 300,
    columns = 3,
    damping = 0.45,
    fadeOut = 0.6,
    ease = 'power3.out',
  } = props

  const mode = props.mode ?? 'image'
  const onCardClick =
    mode === 'icon' && 'onCardClick' in props ? props.onCardClick : undefined

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

  const handleCardMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    card.style.setProperty('--mouse-x', `${x}px`)
    card.style.setProperty('--mouse-y', `${y}px`)
  }, [])

  const handleCardClick = useCallback(
    (url?: string, item?: ChromaIconItem) => {
      if (mode === 'icon' && item && onCardClick) {
        onCardClick(item)
      } else if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    },
    [mode, onCardClick],
  )

  return (
    <div
      ref={rootRef}
      className={`chroma-grid ${className}`.trim()}
      style={
        {
          '--r': `${radius}px`,
          '--cols': columns,
        } as React.CSSProperties
      }
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {mode === 'image'
        ? (items as ChromaItem[]).map((c, i) => (
            <article
              key={i}
              className="chroma-card chroma-card-image"
              onMouseMove={handleCardMove}
              onClick={() => handleCardClick(c.url)}
              style={
                {
                  '--card-border': c.borderColor || 'transparent',
                  '--card-gradient': c.gradient || 'none',
                  cursor: c.url ? 'pointer' : 'default',
                } as React.CSSProperties
              }
            >
              <div className="chroma-img-wrapper">
                <img src={c.image} alt={c.title} loading="lazy" />
              </div>
              <footer className="chroma-info">
                <h3 className="name">{c.title}</h3>
                {c.handle && <span className="handle">{c.handle}</span>}
                <p className="role">{c.subtitle}</p>
                {c.location && <span className="location">{c.location}</span>}
              </footer>
            </article>
          ))
        : (items as ChromaIconItem[]).map((c, i) => (
            <article
              key={i}
              className="chroma-card chroma-card-icon"
              onMouseMove={handleCardMove}
              onClick={() => handleCardClick(undefined, c)}
              style={
                {
                  '--card-border': c.borderColor || 'transparent',
                  '--card-gradient': c.gradient || 'none',
                  cursor: c.to || onCardClick ? 'pointer' : 'default',
                } as React.CSSProperties
              }
            >
              <div className="chroma-icon-row">
                <div className="chroma-icon-wrapper">{c.icon}</div>
                {(c.to || onCardClick) && (
                  <ChevronRight className="chroma-arrow" />
                )}
              </div>
              <footer className="chroma-info chroma-info-icon">
                <h3 className="name">{c.title}</h3>
                {c.subtitle && <p className="role">{c.subtitle}</p>}
              </footer>
            </article>
          ))}
      <div className="chroma-overlay" />
      <div ref={fadeRef} className="chroma-fade" />
    </div>
  )
}

export default ChromaGrid
