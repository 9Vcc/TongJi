import { defineConfig } from 'vitest/config'

// 必须在任何测试模块导入前设置，确保 prisma.ts 使用独立的测试数据库
// 测试使用 tongji_test 数据库，会在 globalSetup 中自动创建并重置
// 使用 root 账户以便 globalSetup 能 DROP/CREATE DATABASE
// 注意：Prisma CLI 需要 mysql:// 协议
process.env.DATABASE_URL = 'mysql://root:mariadb_ByYjWm@192.168.2.145:3306/tongji_test'

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
  },
})
