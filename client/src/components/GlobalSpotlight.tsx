import { useEffect, useRef } from 'react'
import './GlobalSpotlight.css'

/**
 * 全局聚光灯组件：
 * 挂载在 Layout / Login / PublicRanking 中，监听全局鼠标移动
 * 为所有 .art-card / .magic-bento-card / .pc-card 等卡片设置 CSS 变量
 * 卡片通过 ::after 表面光晕 + inset 边框光晕响应聚光灯
 *
 * 光晕只在卡片内显示，不创建全局悬浮 div（不会出现在侧边栏、顶栏等卡片外区域）
 */
const GlobalSpotlight = () => {
  const rafRef = useRef<number | null>(null)
  const pendingPosRef = useRef({ x: 0, y: 0 })

  /** 需要响应聚光灯的卡片选择器 */
  const CARD_SELECTOR = '.art-card, .art-card-sm, .magic-bento-card, .chroma-card, .pc-card'

  /** 聚光灯影响半径（px）— 卡片在此距离内会发光 */
  const SPOTLIGHT_RADIUS = 240
  /** 近距离全亮半径 */
  const PROXIMITY = SPOTLIGHT_RADIUS * 0.45
  /** 远距离淡出半径 */
  const FADE_DISTANCE = SPOTLIGHT_RADIUS * 0.85

  useEffect(() => {
    // 移动端不启用（触屏无鼠标）
    if (window.innerWidth <= 768) return

    // 缓存主色 hex：优先从 localStorage 读取已保存的主色，fallback 默认蓝色
    const PRIMARY_KEY = 'appearance:primary'
    const PRIMARY_PRESETS: Record<string, string> = {
      blue: '#5d87ff',
      purple: '#b48df3',
      skyblue: '#1d84ff',
      green: '#60c041',
      cyan: '#38c0fc',
      orange: '#f9901f',
      pink: '#ff80c8',
    }
    const storedKey = localStorage.getItem(PRIMARY_KEY)
    let primaryHex = (storedKey && PRIMARY_PRESETS[storedKey]) || '#5d87ff'

    // 解析主色为 RGB 字符串（供卡片 ::after 使用）
    const resolvePrimaryRgb = (): string => {
      // 优先使用缓存的 hex
      const cleaned = primaryHex.replace('#', '')
      const r = parseInt(cleaned.substring(0, 2), 16) || 93
      const g = parseInt(cleaned.substring(2, 4), 16) || 135
      const b = parseInt(cleaned.substring(4, 6), 16) || 255
      return `${r}, ${g}, ${b}`
    }

    // 将 --gs-color 设置到 :root，所有卡片通过 CSS 继承自动获得主题色
    // 这样切换页面后新出现的卡片也能立即获得正确的聚光灯颜色
    const initCardColors = () => {
      const primaryRgb = resolvePrimaryRgb()
      document.documentElement.style.setProperty('--gs-color', primaryRgb)
    }
    initCardColors()

    const handleMouseMove = (e: MouseEvent) => {
      pendingPosRef.current = { x: e.clientX, y: e.clientY }

      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null

        const { x, y } = pendingPosRef.current
        const cards = document.querySelectorAll<HTMLElement>(CARD_SELECTOR)

        cards.forEach((card) => {
          const rect = card.getBoundingClientRect()
          // 跳过不可见的卡片
          if (rect.width === 0 || rect.height === 0) return

          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          // 鼠标到卡片中心的距离，减去卡片尺寸的一半（近似边缘距离）
          const distance =
            Math.hypot(x - centerX, y - centerY) - Math.max(rect.width, rect.height) / 2
          const effectiveDistance = Math.max(0, distance)

          // 计算发光强度 0-1
          let glowIntensity = 0
          if (effectiveDistance <= PROXIMITY) {
            glowIntensity = 1
          } else if (effectiveDistance <= FADE_DISTANCE) {
            glowIntensity = (FADE_DISTANCE - effectiveDistance) / (FADE_DISTANCE - PROXIMITY)
          }

          // 设置卡片局部聚光灯位置（相对卡片百分比）
          const relativeX = ((x - rect.left) / rect.width) * 100
          const relativeY = ((y - rect.top) / rect.height) * 100
          card.style.setProperty('--gs-x', `${relativeX}%`)
          card.style.setProperty('--gs-y', `${relativeY}%`)
          card.style.setProperty('--gs-intensity', glowIntensity.toFixed(3))
        })
      })
    }

    const handleMouseLeave = () => {
      // 鼠标离开视口时清除所有卡片发光
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        card.style.setProperty('--gs-intensity', '0')
      })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    // 监听主题变化（class 切换明暗模式）
    const observer = new MutationObserver(initCardColors)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // 监听主色变化事件（由 useAppearance 触发，携带 hex 值）
    const handlePrimaryChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.hex && typeof detail.hex === 'string') {
        primaryHex = detail.hex
        initCardColors()
      }
    }
    window.addEventListener('theme:primary-change', handlePrimaryChange)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      observer.disconnect()
      window.removeEventListener('theme:primary-change', handlePrimaryChange)
    }
  }, [])

  return null
}

export default GlobalSpotlight
