import prisma from '../src/lib/prisma'

/**
 * 测试设置文件：在每个测试文件执行前运行
 * 导出共享的 prisma 实例供测试使用
 * （DATABASE_URL 已在 vitest.config.ts 中设置为 MariaDB 测试库 tongji_test）
 */
export { prisma }
