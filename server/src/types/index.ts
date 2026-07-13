import type { Role } from '../../generated/prisma/client'

export interface JwtPayload {
  id: number
  username: string
  role: Role
  branchId: number | null
  branchIds: number[]
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}
