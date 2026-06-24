import { createSigner, createVerifier } from 'fast-jwt'
import type { JwtPayload } from '../types'

const JWT_SECRET = 'tongji-secret-key-2026'
const JWT_EXPIRES_IN = '7d'

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
