import { useRef, useCallback, useEffect, type ReactNode } from 'react'
import './TiltCard.css'

interface TiltCardProps {
  children: ReactNode
  className?: string
  /** 最大倾斜角度（度），默认 5 */
  maxTilt?: number
  /** 是否启用背后光晕，默认 true */
  behindGlow?: boolean
  /** 背后光晕颜色（CSS 颜色值），默认主色半透明 */
  glowColor?: string
}

/**
 * 3D 倾斜卡片：鼠标悬停时卡片产生 3D 倾斜效果和背后光晕
 * 灵感来自 React Bits ProfileCard 组件，简化为轻量级包装器
 */
const TiltCard = ({
  children,
  className = '',
  maxTilt = 5,
  behindGlow = true,
  glowColor,
}: TiltCardProps) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // 初始化光晕颜色
  useEffect(() => {
    if (glowColor && wrapRef.current) {
      wrapRef.current.style.setProperty('--tilt-glow', glowColor)
    }
  }, [glowColor])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const wrap = wrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const percentX = (x / rect.width) * 100
        const percentY = (y / rect.height) * 100
        const centerX = percentX - 50
        const centerY = percentY - 50
        const rotateY = (centerX / 50) * maxTilt
        const rotateX = -(centerY / 50) * maxTilt

        wrap.style.setProperty('--tilt-px', `${percentX.toFixed(1)}%`)
        wrap.style.setProperty('--tilt-py', `${percentY.toFixed(1)}%`)
        wrap.style.setProperty('--tilt-rx', `${rotateX.toFixed(2)}deg`)
        wrap.style.setProperty('--tilt-ry', `${rotateY.toFixed(2)}deg`)
      })
    },
    [maxTilt],
  )

  const handleMouseLeave = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.style.setProperty('--tilt-px', '50%')
    wrap.style.setProperty('--tilt-py', '50%')
    wrap.style.setProperty('--tilt-rx', '0deg')
    wrap.style.setProperty('--tilt-ry', '0deg')
  }, [])

  return (
    <div
      ref={wrapRef}
      className={`tilt-card ${className}`.trim()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {behindGlow && <div className="tilt-card-glow" aria-hidden="true" />}
      <div className="tilt-card-shell">{children}</div>
    </div>
  )
}

export default TiltCard
