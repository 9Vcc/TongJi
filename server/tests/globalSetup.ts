import { execSync } from 'child_process'
import { existsSync, rmSync } from 'fs'
import path from 'path'

/**
 * 全局测试设置：在所有测试开始前运行一次
 * - 删除旧的测试数据库
 * - 运行 Prisma 迁移创建表结构
 */
export default function globalSetup() {
  const testDbPath = path.resolve(__dirname, '..', 'test.db')

  // 删除旧测试数据库及其附属文件
  const filesToDelete = [
    testDbPath,
    testDbPath + '-wal',
    testDbPath + '-shm',
    testDbPath + '-journal',
  ]
  for (const f of filesToDelete) {
    if (existsSync(f)) rmSync(f)
  }

  // 运行迁移，在 test.db 上创建表结构
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
}
