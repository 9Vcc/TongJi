import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import cron from 'node-cron';
import prisma from './lib/prisma';
import { hashPassword } from './utils/password';
import { Role } from '../generated/prisma/client';
import { runBackup } from '../scripts/backup';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import branchRoutes from './routes/branches';
import branchGroupRoutes from './routes/branch-groups';
import personnelRoutes from './routes/personnel';
import dataRecordRoutes from './routes/data-records';
import dataQueryRoutes from './routes/data-query';
import rewardRuleRoutes from './routes/reward-rules';
import rankingRoutes from './routes/ranking';
import dashboardRoutes from './routes/dashboard';
import exportRoutes from './routes/export';
import notificationRoutes from './routes/notifications';
import dataHistoryRoutes from './routes/data-history';
import loginRecordRoutes from './routes/login-records';
import namingLevelRoutes from './routes/naming-levels';
import deductionRoutes from './routes/deductions';
import timeSlotMultiplierRoutes from './routes/time-slot-multipliers';
import publicRoutes from './routes/public';

const isDev = process.env.NODE_ENV !== 'production';

// 扩展 FastifyRequest 类型，注入 requestId 用于错误追踪
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

const fastify = Fastify({
  logger: {
    // 开发环境彩色单行输出，生产环境标准 JSON
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: true,
            messageFormat: '{msg}',
          },
        }
      : undefined,
    level: isDev ? 'info' : 'info',
  },
  // 禁用默认的双行请求日志（incoming + completed），改用自定义简洁日志
  disableRequestLogging: true,
});

// 静默路径：频繁轮询的请求不输出日志，避免刷屏
const SILENT_PATHS = new Set(['/', '/health', '/health/live', '/health/ready']);
const requestTimings = new WeakMap<object, bigint>();

fastify.addHook('onRequest', (request, _reply, done) => {
  // 为每个请求注入唯一 ID，便于错误日志追踪
  request.requestId = randomUUID();
  if (SILENT_PATHS.has(request.url)) return done();
  requestTimings.set(request, process.hrtime.bigint());
  done();
});

fastify.addHook('onResponse', (request, reply, done) => {
  if (SILENT_PATHS.has(request.url)) return done();
  const start = requestTimings.get(request);
  if (!start) return done();
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const status = reply.statusCode;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  request.log[level](
    `${request.method} ${request.url} ${status} ${durationMs.toFixed(0)}ms`,
  );
  done();
});

// 配置 CORS：生产环境通过 CORS_ORIGINS 白名单校验，开发环境（未配置时）放行所有来源
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : null;

fastify.register(cors, {
  origin: (origin, cb) => {
    // 开发环境未配置 CORS_ORIGINS 时放行所有来源
    if (!corsOrigins) return cb(null, true);
    // 同源请求（origin 为 undefined）放行
    if (!origin || corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// 注册 multipart 插件（用于文件上传/Excel导入）
fastify.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// 注册速率限制插件（全局默认：每分钟 500 次）
// 阈值留足余量：已认证用户正常使用（页面并发加载、切页）不会误触；
// 公开接口与登录接口已在各自路由文件配置更严格的路由级限流（60/分钟、5/分钟）
// 使用 preHandler 钩子以便路由级 keyGenerator 可读取 request.body（如登录接口的用户名）
const rateLimitMax = process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 500;
const rateLimitWindow = process.env.RATE_LIMIT_WINDOW || '1 minute';
fastify.register(rateLimit, {
  global: true,
  max: rateLimitMax,
  timeWindow: rateLimitWindow,
  hook: 'preHandler',
  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: '请求过于频繁',
    message: `请求频率超过限制（每 ${context.after} 最多 ${context.max} 次），请稍后再试`,
  }),
});

// 注册认证路由
fastify.register(authRoutes);

// 注册账户管理路由
fastify.register(accountRoutes);

// 注册分部管理路由
fastify.register(branchRoutes);

// 注册合厅组管理路由（仅会长可访问）
fastify.register(branchGroupRoutes);

// 注册人员名单管理路由
fastify.register(personnelRoutes);

// 注册数据录入/修改/删除路由
fastify.register(dataRecordRoutes);

// 注册数据查询路由
fastify.register(dataQueryRoutes);

// 注册奖励规则管理路由
fastify.register(rewardRuleRoutes);

// 注册福利计算与排名路由
fastify.register(rankingRoutes);

// 注册数据看板路由
fastify.register(dashboardRoutes);

// 注册数据导出路由
fastify.register(exportRoutes);

// 注册系统通知路由
fastify.register(notificationRoutes);

// 注册录入历史记录路由（会长、超管可见）
fastify.register(dataHistoryRoutes);

// 注册登录记录路由（仅会长可见）
fastify.register(loginRecordRoutes);

// 冠名等级管理路由
fastify.register(namingLevelRoutes);

// 福利扣减路由（会长+超管可编辑）
fastify.register(deductionRoutes);

// 时间段倍率管理路由
fastify.register(timeSlotMultiplierRoutes);

// 公开排名路由（无需登录，所有人可查看）
fastify.register(publicRoutes);

// Prisma 错误码 → HTTP 状态码映射
const PRISMA_ERROR_STATUS: Record<string, number> = {
  P2002: 409, // 唯一约束冲突 → Conflict
  P2025: 404, // 记录不存在 → Not Found
  P2003: 409, // 外键约束失败 → Conflict
};

// Prisma 错误码 → 用户可读消息映射
const PRISMA_ERROR_MESSAGE: Record<string, string> = {
  P2002: '资源已存在（唯一约束冲突）',
  P2025: '资源不存在',
  P2003: '操作冲突（关联数据约束失败）',
};

// 全局错误处理：区分 Prisma 错误码，生产环境日志脱敏，附带 requestId
fastify.setErrorHandler(
  (error: Error & { validation?: unknown; code?: string; statusCode?: number }, request, reply) => {
    const prismaCode = error.code;
    const isPrismaError =
      typeof prismaCode === 'string' && /^P\d{4}$/.test(prismaCode);

    // Fastify schema 校验错误：保持 400 响应（不破坏现有行为）
    if (error.validation) {
      request.log.warn(
        { requestId: request.requestId },
        `参数校验失败 ${request.method} ${request.url}: ${error.message}`
      );
      return reply.code(400).send({ error: error.message });
    }

    // 保留 Fastify 插件预设的 4xx 状态码（如 @fastify/rate-limit 的 429、未注册路由的 404）
    // 这类是客户端错误，不应按服务器 ERROR 级别记录并刷屏
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      request.log.warn(
        { requestId: request.requestId, statusCode: error.statusCode },
        `客户端错误 ${request.method} ${request.url} ${error.statusCode}: ${error.message}`
      );
      return reply.code(error.statusCode).send({ error: error.message });
    }

    // 服务器端错误（Prisma / 未预期异常）才用 ERROR 级别，生产环境日志脱敏
    const errLog = isDev
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: prismaCode,
        }
      : {
          message: error.message,
          name: error.name,
          code: prismaCode,
        };

    request.log.error(
      {
        requestId: request.requestId,
        err: errLog,
      },
      `处理请求出错 ${request.method} ${request.url}`
    );

    // Prisma 错误码映射
    if (isPrismaError && prismaCode && prismaCode in PRISMA_ERROR_STATUS) {
      const statusCode = PRISMA_ERROR_STATUS[prismaCode];
      const message = PRISMA_ERROR_MESSAGE[prismaCode];
      return reply.code(statusCode).send({ error: message });
    }

    // 其他 Prisma 错误 / 非 Prisma 错误 → 500
    return reply.code(500).send({ error: '服务器内部错误' });
  }
);

// 健康检查路由（兼容旧路径，行为同 /health/ready：检查 DB 连通性）
fastify.get('/health', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'connected',
    };
  } catch (err) {
    fastify.log.error({ err }, '健康检查数据库连通性失败');
    return reply.code(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
      db: 'disconnected',
    });
  }
});

// Liveness 探针：仅检查进程存活状态，不检查 DB（用于 k8s liveness probe）
fastify.get('/health/live', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});

// Readiness 探针：检查 DB 连通性，决定是否接流（用于 k8s readiness probe）
fastify.get('/health/ready', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'connected',
    };
  } catch (err) {
    fastify.log.error({ err }, 'Readiness 探针数据库连通性失败');
    return reply.code(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
      db: 'disconnected',
    });
  }
});

// 根路由
fastify.get('/', async () => {
  return { message: 'Tongji API Server is running' };
});

// 种子接口：初始化会长账户（如果不存在）
// 安全约束：生产环境下严格限制——admin 已存在则拒绝，admin 不存在则必须配置 SEED_ADMIN_PASSWORD
fastify.post('/api/seed', async (_request, reply) => {
  const existing = await prisma.account.findUnique({
    where: { username: 'admin' },
  });

  // 生产环境加固：admin 账户已存在时拒绝任何调用
  if (process.env.NODE_ENV === 'production' && existing) {
    return reply.code(403).send({
      message: '生产环境禁止使用种子接口初始化账户',
    });
  }

  // 密码来源：优先使用环境变量，未设置时非生产环境回退到默认密码
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');

  // 生产环境必须显式配置 SEED_ADMIN_PASSWORD，否则视为配置缺失
  if (process.env.NODE_ENV === 'production' && !seedPassword) {
    return reply.code(500).send({
      message: '生产环境未配置 SEED_ADMIN_PASSWORD，拒绝执行种子初始化',
    });
  }

  if (existing) {
    return reply.send({
      message: '会长账户已存在',
      user: {
        id: existing.id,
        username: existing.username,
        nickname: existing.nickname,
        role: existing.role,
      },
    });
  }

  const passwordHash = await hashPassword(seedPassword);
  const admin = await prisma.account.create({
    data: {
      username: 'admin',
      passwordHash,
      role: Role.HUIZHANG,
    },
  });

  return reply.send({
    message: '会长账户创建成功',
    user: {
      id: admin.id,
      username: admin.username,
      nickname: admin.nickname,
      role: admin.role,
    },
  });
});

// 启动服务
const start = async () => {
  try {
    // 监听 IPv6 :: 双栈地址，同时接受 IPv4 与 IPv6 入站连接
    await fastify.listen({ port: 3001, host: '::' });
    fastify.log.info('Server is running on http://[::]:3001 (IPv4/IPv6 dual-stack)');

    // 定时数据库备份：每天凌晨 3 点执行
    cron.schedule('0 3 * * *', () => {
      fastify.log.info('开始执行定时数据库备份...');
      runBackup();
    });
    fastify.log.info('定时备份任务已调度（每天 03:00 执行）');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

// 优雅关闭：收到 SIGTERM/SIGINT 时先关闭 HTTP 服务再断开数据库连接
process.on('SIGTERM', async () => {
  console.log('[server] 收到 SIGTERM，开始优雅关闭...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[server] 收到 SIGINT，开始优雅关闭...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});
