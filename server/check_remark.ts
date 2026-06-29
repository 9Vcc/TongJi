import { PrismaClient } from './generated/prisma/client.ts'
const p = new PrismaClient()
const rows = await p.$queryRaw`SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'TONGji' AND COLUMN_NAME = 'remark'`
console.log('remark 字段查询结果:', JSON.stringify(rows, null, 2))
await p.$disconnect()
