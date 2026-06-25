import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 监听所有网卡，允许内网穿透/局域网访问
    host: true,
    // 允许的内网穿透域名（按需添加）
    allowedHosts: ['ldr.9vcc.top'],
    // 代理 /api 到后端，前端走相对路径，任意域名/IP 访问都能正确转发
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
