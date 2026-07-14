import type { Role } from '../../generated/prisma/client'

export interface JwtPayload {
  id: number
  username: string
  role: Role
  branchId: number | null
  branchIds: number[]
  groupIds: number[]
  mainGroupId: number | null
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}
