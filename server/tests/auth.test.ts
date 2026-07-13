import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import authRoutes from '../src/routes/auth'
import prisma from '../src/lib/prisma'
import { hashPassword } from '../src/utils/password'
import { Role } from '../generated/prisma/client'

let app: FastifyInstance

// 检测数据库是否可用：不可用时跳过整个测试文件，避免 beforeAll 超时
async function isDbAvailable(): Promise<boolean> {
  return Promise.race([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
    // 2 秒内未连接成功视为不可用
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
  ])
}

beforeAll(async (ctx) => {
  // 无数据库环境（如本地 pre-push）跳过 DB 相关测试
  if (!(await isDbAvailable())) {
    ctx.skip()
    return
  }

  // 清理并创建测试用户
  await prisma.account.deleteMany({})

  const hash = await hashPassword('testpass123')
  await prisma.account.create({
    data: {
      username: 'testuser',
      passwordHash: hash,
      role: Role.HUIZHANG,
      status: 'ACTIVE',
    },
  })

  // 创建一个禁用的用户
  const disabledHash = await hashPassword('disabledpass')
  await prisma.account.create({
    data: {
      username: 'disableduser',
      passwordHash: disabledHash,
      role: Role.GUANLI,
      status: 'DISABLED',
    },
  })

  // 构建仅包含认证路由的 Fastify 实例
  app = Fastify()
  await app.register(authRoutes)
  await app.ready()
})

afterAll(async () => {
  if (!app) return
  await prisma.account.deleteMany({})
  await app.close()
  await prisma.$disconnect()
})

describe('认证接口', () => {
  it('登录成功：正确用户名和密码返回 token 和用户信息', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
    expect(body.user.username).toBe('testuser')
    expect(body.user.role).toBe('HUIZHANG')
    expect(body.user.status).toBe('ACTIVE')
  })

  it('登录失败：错误密码返回 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'wrongpassword' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toBe('用户名或密码错误')
  })

  it('登录失败：不存在的用户名返回 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nouser', password: 'anypassword' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toBe('用户名或密码错误')
  })

  it('登录失败：缺少用户名或密码返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: '', password: '' },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBe('用户名和密码不能为空')
  })

  it('登录失败：被禁用的账户返回 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'disableduser', password: 'disabledpass' },
    })

    expect(res.statusCode).toBe(403)
    const body = res.json()
    expect(body.error).toBe('账户已被禁用')
  })

  it('获取当前用户：携带有效 token 返回用户信息', async () => {
    // 先登录获取 token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' },
    })
    const { token } = loginRes.json()

    // 用 token 获取当前用户
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.username).toBe('testuser')
    expect(body.role).toBe('HUIZHANG')
    expect(body.status).toBe('ACTIVE')
  })

  it('获取当前用户：未携带 token 返回 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toBe('未提供认证令牌')
  })

  it('获取当前用户：携带无效 token 返回 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer invalidtoken' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toBe('无效或过期的认证令牌')
  })
})
