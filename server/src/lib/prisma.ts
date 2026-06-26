import { PrismaClient } from '../../generated/prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

// 解析 DATABASE_URL（支持 mariadb:// 和 mysql:// 两种协议格式）
// Prisma CLI 使用 mysql://，应用运行时通过 MariaDB 适配器连接
const dbUrl = process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/tongji'

function parseDbUrl(url: string) {
  const match = url.match(/^(?:mariadb|mysql):\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)$/)
  if (match) {
    const [, user, password, host, port, database] = match
    return { host, user, password: decodeURIComponent(password), port: Number(port), database }
  }
  // 回退：使用默认本地连接
  return { host: 'localhost', user: 'root', password: 'root', port: 3306, database: 'tongji' }
}

const config = parseDbUrl(dbUrl)
const adapter = new PrismaMariaDb(config)
const prisma = new PrismaClient({ adapter })

export default prisma
export { prisma }
