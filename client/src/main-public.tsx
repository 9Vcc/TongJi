import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PublicRanking from './pages/PublicRanking'
import { ToastProvider } from './hooks/useToast'
import { ThemeProvider } from './hooks/useTheme'

/**
 * 公开排名页面独立入口
 * 监听独立端口（默认 5174），不依赖路由、不依赖认证
 * 仅渲染 PublicRanking 页面，复用主应用的组件与 hooks
 *
 * 登录后台链接：通过环境变量 VITE_MAIN_URL 配置主应用地址
 * - 开发环境默认 http://localhost:5173
 * - 生产环境通过 .env 或构建参数指定主应用域名
 */
const MAIN_URL = import.meta.env.VITE_MAIN_URL || 'http://localhost:5173'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <PublicRanking loginUrl={MAIN_URL} />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>
)
