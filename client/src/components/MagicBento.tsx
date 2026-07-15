import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { gsap } from 'gsap'
import './MagicBento.css'

/** MagicBento 卡片数据项 */
export interface MagicBentoItem {
  title: string
  description?: string
  label?: string
  icon?: ReactNode
  /** 点击回调（可选） */
  onClick?: () => void
}

interface MagicBentoProps {
  items: MagicBentoItem[]
  /** 文字是否悬停时自动隐藏，默认 true */
  textAutoHide?: boolean
  /** 启用粒子星星动画，默认 true */
  enableStars?: boolean
  /** 启用边框光晕，默认 true */
  enableBorderGlow?: boolean
  /** 禁用所有动画（移动端自动禁用） */
  disableAnimations?: boolean
  /** 粒子数量，默认 12 */
  particleCount?: number
  /** 启用 3D 倾斜，默认 false */
  enableTilt?: boolean
  /** 光晕 RGB 颜色（无 rgba 包裹），默认主色 */
  glowColor?: string
  /** 启用点击涟漪，默认 true */
  clickEffect?: boolean
  /** 启用磁吸效果，默认 true */
  enableMagnetism?: boolean
  /** 自定义类名 */
  className?: string
}

const DEFAULT_PARTICLE_COUNT = 12
const MOBILE_BREAKPOINT = 768

/** 将 hex 颜色转为 "r, g, b" 格式（用于 GSAP rgba 拼接） */
const hexToRgbStr = (hex: string): string => {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.substring(0, 2), 16)
  const g = parseInt(cleaned.substring(2, 4), 16)
  const b = parseInt(cleaned.substring(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/** 创建粒子 DOM 元素 */
const createParticleElement = (x: number, y: number, color: string) => {
  const el = document.createElement('div')
  el.className = 'mb-particle'
  el.style.cssText = `
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(${color}, 1);
    box-shadow: 0 0 6px rgba(${color}, 0.6);
    pointer-events: none;
    z-index: 100;
    left: ${x}px;
    top: ${y}px;
  `
  return el
}

/** 粒子卡片：包含星星粒子、倾斜、磁吸、点击涟漪效果 */
interface ParticleCardProps {
  children: ReactNode
  className: string
  style: CSSProperties
  disableAnimations: boolean
  particleCount: number
  glowColor: string
  enableTilt: boolean
  clickEffect: boolean
  enableMagnetism: boolean
}

const ParticleCard = ({
  children,
  className,
  style,
  disableAnimations,
  particleCount,
  glowColor,
  enableTilt,
  clickEffect,
  enableMagnetism,
}: ParticleCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<HTMLDivElement[]>([])
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const isHoveredRef = useRef(false)
  const memoizedParticles = useRef<HTMLDivElement[]>([])
  const particlesInitialized = useRef(false)
  const magnetismAnimationRef = useRef<gsap.core.Tween | null>(null)

  const initializeParticles = useCallback(() => {
    if (particlesInitialized.current || !cardRef.current) return
    const { width, height } = cardRef.current.getBoundingClientRect()
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor),
    )
    particlesInitialized.current = true
  }, [particleCount, glowColor])

  const clearAllParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    magnetismAnimationRef.current?.kill()
    particlesRef.current.forEach((particle) => {
      gsap.to(particle, {
        scale: 0,
        opacity: 0,
        duration: 0.3,
        ease: 'back.in(1.7)',
        onComplete: () => {
          particle.parentNode?.removeChild(particle)
        },
      })
    })
    particlesRef.current = []
  }, [])

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return
    if (!particlesInitialized.current) initializeParticles()

    memoizedParticles.current.forEach((particle, index) => {
      const timeoutId = setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return
        const clone = particle.cloneNode(true) as HTMLDivElement
        cardRef.current.appendChild(clone)
        particlesRef.current.push(clone)

        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' })
        gsap.to(clone, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: 'none',
          repeat: -1,
          yoyo: true,
        })
        gsap.to(clone, {
          opacity: 0.3,
          duration: 1.5,
          ease: 'power2.inOut',
          repeat: -1,
          yoyo: true,
        })
      }, index * 100)
      timeoutsRef.current.push(timeoutId)
    })
  }, [initializeParticles])

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return
    const element = cardRef.current

    const handleMouseEnter = () => {
      isHoveredRef.current = true
      animateParticles()
      if (enableTilt) {
        gsap.to(element, {
          rotateX: 5,
          rotateY: 5,
          duration: 0.3,
          ease: 'power2.out',
          transformPerspective: 1000,
        })
      }
    }

    const handleMouseLeave = () => {
      isHoveredRef.current = false
      clearAllParticles()
      if (enableTilt) {
        gsap.to(element, { rotateX: 0, rotateY: 0, duration: 0.3, ease: 'power2.out' })
      }
      if (enableMagnetism) {
        gsap.to(element, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' })
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return
      const rect = element.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const centerX = rect.width / 2
      const centerY = rect.height / 2

      if (enableTilt) {
        const rotateX = ((y - centerY) / centerY) * -10
        const rotateY = ((x - centerX) / centerX) * 10
        gsap.to(element, { rotateX, rotateY, duration: 0.1, ease: 'power2.out', transformPerspective: 1000 })
      }

      if (enableMagnetism) {
        const magnetX = (x - centerX) * 0.05
        const magnetY = (y - centerY) * 0.05
        magnetismAnimationRef.current = gsap.to(element, { x: magnetX, y: magnetY, duration: 0.3, ease: 'power2.out' })
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (!clickEffect) return
      const rect = element.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height),
      )
      const ripple = document.createElement('div')
      ripple.style.cssText = `
        position: absolute;
        width: ${maxDistance * 2}px;
        height: ${maxDistance * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(${glowColor}, 0.4) 0%, rgba(${glowColor}, 0.2) 30%, transparent 70%);
        left: ${x - maxDistance}px;
        top: ${y - maxDistance}px;
        pointer-events: none;
        z-index: 1000;
      `
      element.appendChild(ripple)
      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 1 },
        { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() },
      )
    }

    element.addEventListener('mouseenter', handleMouseEnter)
    element.addEventListener('mouseleave', handleMouseLeave)
    element.addEventListener('mousemove', handleMouseMove)
    element.addEventListener('click', handleClick)

    return () => {
      isHoveredRef.current = false
      element.removeEventListener('mouseenter', handleMouseEnter)
      element.removeEventListener('mouseleave', handleMouseLeave)
      element.removeEventListener('mousemove', handleMouseMove)
      element.removeEventListener('click', handleClick)
      clearAllParticles()
    }
  }, [animateParticles, clearAllParticles, disableAnimations, enableTilt, enableMagnetism, clickEffect, glowColor])

  return (
    <div
      ref={cardRef}
      className={`${className} mb-particle-container`}
      style={{ ...style, position: 'relative', overflow: 'hidden' }}
    >
      {children}
    </div>
  )
}

/** 移动端检测 hook */
const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  return isMobile
}

/**
 * MagicBento 魔法便当盒网格：
 * 集成粒子星星、全局聚光灯、边框光晕、3D 倾斜、磁吸、点击涟漪效果
 * 适配项目主题变量与明暗模式
 */
const MagicBento = ({
  items,
  textAutoHide = true,
  enableStars = true,
  enableBorderGlow = true,
  disableAnimations = false,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = false,
  glowColor,
  clickEffect = true,
  enableMagnetism = true,
  className = '',
}: MagicBentoProps) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const isMobile = useMobileDetection()
  const shouldDisableAnimations = disableAnimations || isMobile

  // 光晕颜色：默认从主色派生，暗色模式稍亮
  const resolvedGlowColor =
    glowColor ?? hexToRgbStr(getComputedStyle(document.documentElement).getPropertyValue('--art-primary').trim() || '#5d87ff')

  return (
    <>
      <div className={`mb-card-grid mb-section ${className}`.trim()} ref={gridRef}>
        {items.map((card, index) => {
          const baseClassName = `magic-bento-card ${textAutoHide ? 'magic-bento-card--text-autohide' : ''} ${enableBorderGlow ? 'magic-bento-card--border-glow' : ''}`
          const cardStyle = {
            '--glow-color': resolvedGlowColor,
          } as CSSProperties

          const handleClick = () => card.onClick?.()

          const content = (
            <>
              <div className="magic-bento-card__header">
                {card.icon && <div className="magic-bento-card__icon">{card.icon}</div>}
                {card.label && <div className="magic-bento-card__label">{card.label}</div>}
              </div>
              <div className="magic-bento-card__content">
                <h2 className="magic-bento-card__title">{card.title}</h2>
                {card.description && <p className="magic-bento-card__description">{card.description}</p>}
              </div>
            </>
          )

          if (enableStars && !shouldDisableAnimations) {
            return (
              <ParticleCard
                key={index}
                className={baseClassName}
                style={cardStyle}
                disableAnimations={shouldDisableAnimations}
                particleCount={particleCount}
                glowColor={resolvedGlowColor}
                enableTilt={enableTilt}
                clickEffect={clickEffect}
                enableMagnetism={enableMagnetism}
              >
                <div className="magic-bento-card__clickable" onClick={handleClick}>
                  {content}
                </div>
              </ParticleCard>
            )
          }

          return (
            <div
              key={index}
              className={`${baseClassName} mb-particle-container`}
              style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}
              onClick={handleClick}
            >
              {content}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default MagicBento
