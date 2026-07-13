import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdir, utimes } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import * as compressionPlugin from 'vite-plugin-compression'

// vite-plugin-compression@0.5.1 的 .d.ts 在 TS6 + module:nodenext 下，默认导出
// 被解析为不可调用的命名空间类型；运行时 .default 仍为插件工厂函数，做类型断言恢复。
type CompressionOptions = {
  verbose?: boolean
  threshold?: number
  filter?: RegExp | ((file: string) => boolean)
  disable?: boolean
  algorithm?: 'gzip' | 'brotliCompress' | 'deflate' | 'deflateRaw'
  ext?: string
  compressionOptions?: Record<string, unknown>
  deleteOriginFile?: boolean
  success?: () => void
}
const compression = compressionPlugin.default as unknown as (
  options?: CompressionOptions,
) => Plugin

// vite-plugin-compression@0.5.1 两个实例共享模块级 mtimeCache，gzip 先运行会写入
// Date.now()，导致 brotli 实例因 `mtimeMs <= mtimeCache` 而跳过所有文件、不生成 .br。
// 此插件在两次压缩之间刷新 dist 内文件 mtime，使 brotli 实例也能正常处理。
// 注：compression 默认 filter 为 /\.(js|mjs|json|css|html)$/i，会自动跳过 .gz 文件，
// 因此不会产生 .gz.br 这类副产物。
function refreshMtimesBeforeBrotli(): Plugin {
  let distDir = ''
  return {
    name: 'refresh-mtimes-before-brotli',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      distDir = isAbsolute(config.build.outDir)
        ? config.build.outDir
        : join(config.root, config.build.outDir)
    },
    async closeBundle() {
      const now = new Date()
      const walk = async (dir: string) => {
        let entries
        try {
          entries = await readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        await Promise.all(
          entries.map(async (e) => {
            const full = join(dir, e.name)
            if (e.isDirectory()) {
              await walk(full)
            } else {
              try {
                await utimes(full, now, now)
              } catch {
                /* ignore */
              }
            }
          }),
        )
      }
      await walk(distDir)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 预压缩：生成 .gz 文件
    compression(),
    // 刷新 mtime，绕过 vite-plugin-compression 共享 mtimeCache 的限制
    refreshMtimesBeforeBrotli(),
    // 预压缩：生成 .br 文件
    compression({ algorithm: 'brotliCompress' }),
  ],
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
  build: {
    // 生产环境默认无 sourcemap，显式声明
    sourcemap: false,
    // 提升单 chunk 警告阈值（KB）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 手动分包：将第三方依赖拆分为独立 chunk，提升缓存命中率
        // 注：Vite 8 使用 Rolldown，manualChunks 仅支持函数形式
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
            return 'react-vendor'
          }
          if (/[\\/]node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/.test(id)) {
            return 'chart-vendor'
          }
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) {
            return 'motion-vendor'
          }
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
            return 'icon-vendor'
          }
        },
      },
    },
  },
})
