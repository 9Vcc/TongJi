import { execSync } from 'child_process'
import mariadb from 'mariadb'

/**
 * 全局测试设置：在所有测试开始前运行一次
 * - 连接 MariaDB 服务器，重建测试数据库 tongji_test
 * - 运行 Prisma 迁移创建表结构
 *
 * 前置条件：192.168.2.145 的 MariaDB 服务可访问，root 账户可登录
 */
export default async function globalSetup() {
  const testDbUrl =
    process.env.DATABASE_URL ||
    'mysql://root:mariadb_ByYjWm@192.168.2.145:3306/tongji_test'

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
    pool = mariadb.createPool({ ...conn, connectionLimit: 1 })
    const conn2 = await pool.getConnection()
    await conn2.query(`DROP DATABASE IF EXISTS \`${database}\``)
    await conn2.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    await conn2.release()
  } finally {
    if (pool) await pool.end()
  }

  // 运行迁移，在测试数据库上创建表结构
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDbUrl },
  })
}
