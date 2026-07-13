/**
 * MariaDB 数据库自动备份脚本
 *
 * 功能：
 * - 使用 mysqldump 将数据库导出为 SQL 文件到 server/backups/ 目录
 * - 文件名格式：backup-YYYY-MM-DD-HH-mm-ss.sql
 * - 自动清理超过 30 天的旧备份
 *
 * 使用方式：
 * - 直接执行：tsx scripts/backup.ts
 * - 定时执行：由 index.ts 中 node-cron 每天凌晨 3 点调用 runBackup()
 *
 * 依赖：系统需安装 mysqldump（或 mariadb-dump）命令行工具
 *   Debian/Ubuntu: apt install default-mysql-client
 *   Arch Linux:   pacman -S mariadb-clients
 *   Docker:       镜像中安装 mariadb-client（见 Dockerfile）
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// 备份目录
const BACKUP_DIR = path.resolve(__dirname, '..', 'backups')
// 保留天数
const RETENTION_DAYS = 30

/**
 * 从 DATABASE_URL 解析连接参数
 */
function parseDbUrl(url: string) {
  const match = url.match(/^(?:mariadb|mysql):\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)$/)
  if (match) {
    const [, user, password, host, port, database] = match
    return {
      host,
      user,
      password: decodeURIComponent(password),
      port: Number(port),
      database,
    }
  }
  return null
}

/**
 * 查找可用的 dump 工具：优先 mysqldump，其次 mariadb-dump
 */
function findDumpTool(): string {
  for (const cmd of ['mysqldump', 'mariadb-dump']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' })
      return cmd
    } catch {
      // 继续尝试下一个
    }
  }
  return ''
}

/**
 * 生成备份文件名：backup-YYYY-MM-DD-HH-mm-ss.sql
 */
function getBackupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `backup-${y}-${m}-${d}-${h}-${min}-${s}.sql`
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
    if (!file.startsWith('backup-') || !file.endsWith('.sql')) continue
    const filePath = path.join(BACKUP_DIR, file)
    try {
      const stat = fs.statSync(filePath)
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath)
        deleted++
      }
    } catch (err) {
      console.error(`[backup][警告] 清理过期备份失败，文件: ${filePath}`, err)
    }
  }
  return deleted
}

/**
 * 执行一次数据库备份
 * @returns 备份文件路径，若失败则返回 null
 */
export function runBackup(): string | null {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('[backup] 未设置 DATABASE_URL 环境变量')
    return null
  }

  const config = parseDbUrl(dbUrl)
  if (!config) {
    console.error('[backup][警告] 无法解析 DATABASE_URL，备份已中止。请检查协议格式（需为 mariadb:// 或 mysql://）:', dbUrl)
    return null
  }

  const dumpTool = findDumpTool()
  if (!dumpTool) {
    console.error(
      '[backup] 未找到 mysqldump 或 mariadb-dump 命令，跳过备份。请安装 mariadb-clients',
    )
    return null
  }

  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const backupFileName = getBackupFileName()
  const backupPath = path.join(BACKUP_DIR, backupFileName)

  try {
    // 使用 mysqldump 导出数据库（通过 MYSQL_PWD 环境变量传递密码，避免命令行暴露）
    const dump = execFileSync(
      dumpTool,
      [
        '-h',
        config.host,
        '-P',
        String(config.port),
        '-u',
        config.user,
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        config.database,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        env: { ...process.env, MYSQL_PWD: config.password },
      },
    )

    fs.writeFileSync(backupPath, dump, 'utf-8')
    console.log(`[backup] 备份成功: ${backupPath}`)

    // 清理旧备份
    const deleted = cleanOldBackups()
    if (deleted > 0) {
      console.log(`[backup] 已清理 ${deleted} 个过期备份`)
    }

    return backupPath
  } catch (err) {
    console.error('[backup][警告] 数据库备份失败，请及时检查并手动备份:', err)
    return null
  }
}

// 直接执行脚本时运行备份
if (require.main === module) {
  runBackup()
}
