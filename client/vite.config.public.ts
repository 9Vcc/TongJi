import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 公开排名页面独立 Vite 配置
// 监听独立端口（默认 5174），与主应用（5173）隔离
// 复用后端 /api/public/* 接口，通过 proxy 转发到 3001
export default defineConfig({
  plugins: [react()],
  // 独立入口 HTML，避免加载主应用的路由与认证代码
  root: '.',
  build: {
    // 独立构建输出目录，与主应用 dist 隔离
    outDir: 'dist-public',
    rollupOptions: {
      input: 'public.html',
    },
  },
  server: {
    // 监听所有网卡，允许内网穿透/局域网访问
    host: true,
    // 独立端口
    port: 5174,
    // 允许的内网穿透域名（与主应用一致）
    allowedHosts: ['ldr.9vcc.top'],
    // 代理 /api 到后端，复用主应用的公开接口
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
