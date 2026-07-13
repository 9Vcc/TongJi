import { defineConfig } from 'vitest/config'

// 必须在任何测试模块导入前设置，确保 prisma.ts 使用独立的测试数据库
// 测试使用 tongji_test 数据库，会在 globalSetup 中自动创建并重置
// 使用 root 账户以便 globalSetup 能 DROP/CREATE DATABASE
// 注意：Prisma CLI 需要 mysql:// 协议
// 默认指向本地开发 MariaDB（与 docker-compose.dev.yml 默认值一致），
// 可通过环境变量 DATABASE_URL 覆盖以指向其他实例
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'mysql://root:root123@127.0.0.1:3306/tongji_test'

// jwt.ts 在模块加载时校验 JWT_SECRET，缺失会 process.exit(1)
// 测试环境默认注入一个足够长的密钥（仅用于测试，不用于生产）
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-vitest-only-not-for-production'

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
})
