import { execSync } from 'child_process'
import mariadb from 'mariadb'

/**
 * 全局测试设置：在所有测试开始前运行一次
 * - 连接 MariaDB 服务器，重建测试数据库 tongji_test
 * - 运行 Prisma 迁移创建表结构
 *
 * 前置条件：本地 MariaDB 服务可访问（默认 127.0.0.1:3306，可通过 DATABASE_URL 覆盖），root 账户可登录
 *
 * 容错：若 MariaDB 不可达，打印警告并跳过 DB 准备，使纯函数测试仍可运行。
 * （DB 相关测试会在使用 prisma 时各自失败，符合预期）
 */
export default async function globalSetup() {
  const testDbUrl =
    process.env.DATABASE_URL ||
    'mysql://root:root123@127.0.0.1:3306/tongji_test'

  const match = testDbUrl.match(
    /^(?:mariadb|mysql):\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)$/,
  )
  if (!match) {
    throw new Error(`无法解析 DATABASE_URL: ${testDbUrl}`)
  }
  const [, user, password, host, port, database] = match
  const conn = {
    host,
    user,
    password: decodeURIComponent(password),
    port: Number(port),
  }

  // 连接服务器（不指定数据库），DROP 并 CREATE 测试数据库
  let pool
  try {
    pool = mariadb.createPool({ ...conn, connectionLimit: 1, acquireTimeout: 5000 })
    const conn2 = await pool.getConnection()
    await conn2.query(`DROP DATABASE IF EXISTS \`${database}\``)
    await conn2.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    await conn2.release()
  } catch (err) {
    // MariaDB 不可达：跳过 DB 准备，仅打印警告。
    // 这使得不依赖数据库的纯函数测试仍可运行；DB 相关测试会在使用 prisma 时各自失败。
    const code = (err as { code?: string }).code ?? ''
    console.warn(
      `[globalSetup] 跳过数据库准备：无法连接 MariaDB (${host}:${port})。` +
        `纯函数测试可正常运行，依赖数据库的测试将失败。错误: ${code || (err as Error).message}`,
    )
    // 标记数据库不可用，供测试文件通过 describe.skipIf 跳过
    process.env.DB_AVAILABLE = '0'
    return
  } finally {
    if (pool) await pool.end()
  }

  // 运行迁移，在测试数据库上创建表结构
  process.env.DB_AVAILABLE = '1'
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDbUrl },
  })
}
