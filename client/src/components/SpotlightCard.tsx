import { type ReactNode } from 'react'
import './SpotlightCard.css'

interface SpotlightCardProps {
  children: ReactNode
  className?: string
}

/**
 * 通用卡片容器：带 art-card 类，响应全局聚光灯（GlobalSpotlight）的边框光晕
 * 聚光灯效果由 Layout 中挂载的 GlobalSpotlight 统一处理，本组件不再独立实现
 */
const SpotlightCard = ({
  children,
  className = '',
}: SpotlightCardProps) => {
  return (
    <div className={`card-spotlight art-card ${className}`.trim()}>
      {children}
    </div>
  )
}

export default SpotlightCard
