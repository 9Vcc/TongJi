/**
 * SQLite 数据库自动备份脚本
 *
 * 功能：
 * - 复制当前 SQLite 数据库文件到 server/backups/ 目录
 * - 文件名格式：backup-YYYY-MM-DD-HH-mm-ss.db
 * - 自动清理超过 30 天的旧备份
 *
 * 使用方式：
 * - 直接执行：tsx scripts/backup.ts
 * - 定时执行：由 index.ts 中 node-cron 每天凌晨 3 点调用 runBackup()
 */

import fs from 'fs'
import path from 'path'

// 源数据库文件路径（相对 server 目录）
const DB_PATH = path.resolve(__dirname, '..', 'dev.db')
// 备份目录
const BACKUP_DIR = path.resolve(__dirname, '..', 'backups')
// 保留天数
const RETENTION_DAYS = 30

/**
 * 生成备份文件名：backup-YYYY-MM-DD-HH-mm-ss.db
 */
function getBackupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `backup-${y}-${m}-${d}-${h}-${min}-${s}.db`
}

/**
 * 清理超过保留天数的旧备份文件
 */
function cleanOldBackups(): number {
  if (!fs.existsSync(BACKUP_DIR)) return 0

  const now = Date.now()
  const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000
  let deleted = 0

  const files = fs.readdirSync(BACKUP_DIR)
  for (const file of files) {
    if (!file.startsWith('backup-') || !file.endsWith('.db')) continue
    const filePath = path.join(BACKUP_DIR, file)
    try {
      const stat = fs.statSync(filePath)
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath)
        deleted++
      }
    } catch {
      // 忽略单个文件清理失败
    }
  }
  return deleted
}

/**
 * 执行一次数据库备份
 * @returns 备份文件路径，若失败则返回 null
 */
export function runBackup(): string | null {
  // 确保源数据库存在
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backup] 源数据库文件不存在: ${DB_PATH}`)
    return null
  }

  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const backupFileName = getBackupFileName()
  const backupPath = path.join(BACKUP_DIR, backupFileName)

  try {
    // 复制数据库文件（SQLite 单文件，直接复制即可）
    fs.copyFileSync(DB_PATH, backupPath)
    console.log(`[backup] 备份成功: ${backupPath}`)

    // 清理旧备份
    const deleted = cleanOldBackups()
    if (deleted > 0) {
      console.log(`[backup] 已清理 ${deleted} 个过期备份`)
    }

    return backupPath
  } catch (err) {
    console.error('[backup] 备份失败:', err)
    return null
  }
}

// 直接执行脚本时运行备份
if (require.main === module) {
  runBackup()
}
