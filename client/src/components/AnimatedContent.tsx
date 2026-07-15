import { useRef, useEffect, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface AnimatedContentProps {
  children: ReactNode
  /** 滚动容器（选择器或 HTMLElement），默认自动检测 #main-scroll */
  container?: string | HTMLElement | null
  /** 动画移动距离（px），默认 100 */
  distance?: number
  /** 动画方向：'vertical' | 'horizontal'，默认 'vertical' */
  direction?: 'vertical' | 'horizontal'
  /** 是否反向移动，默认 false */
  reverse?: boolean
  /** 动画时长（秒），默认 0.8 */
  duration?: number
  /** GSAP 缓动函数，默认 'power3.out' */
  ease?: string
  /** 初始透明度，默认 0 */
  initialOpacity?: number
  /** 是否动画透明度，默认 true */
  animateOpacity?: boolean
  /** 初始缩放，默认 1 */
  scale?: number
  /** 触发阈值（0-1），默认 0.1 */
  threshold?: number
  /** 延迟（秒），默认 0 */
  delay?: number
  /** 动画完成后多少秒消失，0 表示不消失，默认 0 */
  disappearAfter?: number
  /** 消失动画时长（秒），默认 0.5 */
  disappearDuration?: number
  /** 消失动画缓动，默认 'power3.in' */
  disappearEase?: string
  /** 动画完成回调 */
  onComplete?: () => void
  /** 消失动画完成回调 */
  onDisappearanceComplete?: () => void
  /** 自定义类名 */
  className?: string
}

/**
 * AnimatedContent 滚动触发动画：
 * 当元素滚动进入视口时，从指定方向滑入并淡入
 * 依赖 GSAP ScrollTrigger，自动检测 #main-scroll 作为滚动容器
 */
const AnimatedContent = ({
  children,
  container,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power3.in',
  onComplete,
  onDisappearanceComplete,
  className = '',
}: AnimatedContentProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 滚动容器：优先使用传入的 container，否则自动检测 #main-scroll
    let scrollerTarget: HTMLElement | null
    if (typeof container === 'string') {
      scrollerTarget = document.querySelector<HTMLElement>(container)
    } else if (container) {
      scrollerTarget = container
    } else {
      scrollerTarget = document.getElementById('main-scroll')
    }

    const axis = direction === 'horizontal' ? 'x' : 'y'
    const offset = reverse ? -distance : distance
    const startPct = (1 - threshold) * 100

    gsap.set(el, {
      [axis]: offset,
      scale,
      opacity: animateOpacity ? initialOpacity : 1,
      visibility: 'visible',
    })

    const tl = gsap.timeline({
      paused: true,
      delay,
      onComplete: () => {
        onComplete?.()
        if (disappearAfter > 0) {
          gsap.to(el, {
            [axis]: reverse ? distance : -distance,
            scale: 0.8,
            opacity: animateOpacity ? initialOpacity : 0,
            delay: disappearAfter,
            duration: disappearDuration,
            ease: disappearEase,
            onComplete: () => onDisappearanceComplete?.(),
          })
        }
      },
    })

    tl.to(el, {
      [axis]: 0,
      scale: 1,
      opacity: 1,
      duration,
      ease,
    })

    const st = ScrollTrigger.create({
      trigger: el,
      scroller: scrollerTarget || undefined,
      start: `top ${startPct}%`,
      once: true,
      onEnter: () => tl.play(),
    })

    return () => {
      st.kill()
      tl.kill()
    }
  }, [
    container,
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    threshold,
    delay,
    disappearAfter,
    disappearDuration,
    disappearEase,
    onComplete,
    onDisappearanceComplete,
  ])

  return (
    <div ref={ref} className={className} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  )
}

export default AnimatedContent
