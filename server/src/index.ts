import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import cron from 'node-cron';
import prisma from './lib/prisma';
import { hashPassword } from './utils/password';
import { Role } from '../generated/prisma/client';
import { runBackup } from '../scripts/backup';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import branchRoutes from './routes/branches';
import personnelRoutes from './routes/personnel';
import dataRecordRoutes from './routes/data-records';
import dataQueryRoutes from './routes/data-query';
import rewardRuleRoutes from './routes/reward-rules';
import rankingRoutes from './routes/ranking';
import dashboardRoutes from './routes/dashboard';
import exportRoutes from './routes/export';
import notificationRoutes from './routes/notifications';
import dataHistoryRoutes from './routes/data-history';

const isDev = process.env.NODE_ENV !== 'production';

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
const SILENT_PATHS = new Set(['/health', '/']);
const requestTimings = new WeakMap<object, bigint>();

fastify.addHook('onRequest', (request, _reply, done) => {
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

// 配置 CORS：允许所有来源（任意域名/IP/端口），便于内网穿透与公网访问
fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// 注册 JWT 插件
fastify.register(jwt, {
  secret: 'tongji-secret-key-2026',
});

// 注册 multipart 插件（用于文件上传/Excel导入）
fastify.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// 注册认证路由
fastify.register(authRoutes);

// 注册账户管理路由
fastify.register(accountRoutes);

// 注册分部管理路由
fastify.register(branchRoutes);

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

// 健康检查路由
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// 根路由
fastify.get('/', async () => {
  return { message: 'Tongji API Server is running' };
});

// 种子接口：初始化会长账户（如果不存在）
fastify.post('/api/seed', async (_request, reply) => {
  const existing = await prisma.account.findUnique({
    where: { username: 'admin' },
  });

  if (existing) {
    return reply.send({
      message: '会长账户已存在',
      user: {
        id: existing.id,
        username: existing.username,
        role: existing.role,
      },
    });
  }

  const passwordHash = await hashPassword('admin123');
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
