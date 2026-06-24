import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  duration?: number
  className?: string
  /** 是否启用千分位格式化 */
  format?: boolean
  /** 小数位数 */
  decimals?: number
}

function formatNumber(n: number, format: boolean, decimals: number): string {
  const fixed = Number.isFinite(n) ? n.toFixed(decimals) : '0'
  if (!format) {
    // 整数场景下去除多余小数
    return decimals === 0 ? fixed : fixed.replace(/\.?0+$/, '')
  }
  const [intPart, decPart] = fixed.split('.')
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart ? `${withSep}.${decPart}` : withSep
}

export default function AnimatedNumber({
  value,
  duration = 800,
  className = '',
  format = true,
  decimals = 0,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    const to = Number.isFinite(value) ? value : 0
    const diff = to - from

    if (diff === 0) {
      setDisplay(to)
      return
    }

    startRef.current = null
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + diff * eased
      setDisplay(current)
      fromRef.current = current
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setDisplay(to)
        fromRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {formatNumber(display, format, decimals)}
    </span>
  )
}
