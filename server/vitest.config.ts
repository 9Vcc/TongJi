import { defineConfig } from 'vitest/config'

// 必须在任何测试模块导入前设置，确保 prisma.ts 使用独立的测试数据库
process.env.DATABASE_URL = 'file:./test.db'

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
  },
})
