import { createSigner, createVerifier } from 'fast-jwt'
import type { JwtPayload } from '../types'

// 优先使用环境变量，开发环境回退到默认值
const JWT_SECRET = process.env.JWT_SECRET || 'tongji-secret-key-2026'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[安全警告] 生产环境必须设置 JWT_SECRET 环境变量')
  process.exit(1)
}

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
