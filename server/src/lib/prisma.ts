import { PrismaClient } from '../../generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

// 支持通过环境变量配置数据库路径（测试时使用独立 test.db）
// DATABASE_URL 格式如 "file:./dev.db"，需去掉 "file:" 前缀
const rawUrl = process.env.DATABASE_URL || 'file:./dev.db'
const dbUrl = rawUrl.replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

export default prisma
export { prisma }
