import { type MouseEvent } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle() {
  const { resolvedTheme, themeAnimation } = useTheme()

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun

  // 主按钮点击：直接明暗切换 + 圆形扩散动画
  const handleQuickToggle = (e: MouseEvent) => {
    themeAnimation(e)
  }

  return (
    <button
      onClick={handleQuickToggle}
      className="icon-rotate-hover p-2 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label="切换主题"
      title={`当前：${resolvedTheme === 'dark' ? '暗黑' : '明亮'}（点击切换）`}
    >
      <CurrentIcon size={20} />
    </button>
  )
}
