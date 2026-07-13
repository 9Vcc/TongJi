import { PrismaClient } from '../../generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

// 解析 DATABASE_URL（支持 mariadb:// 和 mysql:// 两种协议格式）
// Prisma CLI 使用 mysql://，应用运行时通过 MariaDB 适配器连接
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('[prisma] 环境变量 DATABASE_URL 未设置，无法连接数据库')
  process.exit(1)
}

function parseDbUrl(url: string) {
  const match = url.match(/^(?:mariadb|mysql):\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)$/)
  if (match) {
    const [, user, password, host, port, database] = match
    return { host, user, password: decodeURIComponent(password), port: Number(port), database }
  }
  throw new Error(`[prisma] DATABASE_URL 格式无效: ${url}`)
}

const config = parseDbUrl(dbUrl)
const adapter = new PrismaMariaDb(config)
const prisma = new PrismaClient({ adapter })

export default prisma
export { prisma }
