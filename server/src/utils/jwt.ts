import { createSigner, createVerifier } from 'fast-jwt'
import type { JwtPayload } from '../types'

// 启动时校验 JWT_SECRET：必须存在且长度 >= 16，否则拒绝启动
if (!process.env.JWT_SECRET) {
  console.error('[安全错误] 缺少环境变量 JWT_SECRET，请在 .env 中配置')
  process.exit(1)
}
if (process.env.JWT_SECRET.length < 16) {
  console.error('[安全错误] JWT_SECRET 长度不足 16 位，请使用更强的密钥')
  process.exit(1)
}

export const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

const signer = createSigner({
  key: JWT_SECRET,
  expiresIn: JWT_EXPIRES_IN,
})

const verifier = createVerifier({
  key: JWT_SECRET,
})

export function signToken(payload: JwtPayload): string {
  return signer(payload)
}

export function verifyToken(token: string): JwtPayload {
  return verifier(token) as JwtPayload
}
