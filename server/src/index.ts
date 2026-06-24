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

const fastify = Fastify({ logger: true });

// 配置 CORS：允许前端开发服务器（Vite 默认端口及备用端口）访问
fastify.register(cors, {
  origin: (origin, cb) => {
    // 允许无 origin 的请求（如 curl、同源请求、服务器端请求）
    if (!origin) return cb(null, true);
    // 允许 localhost 任意端口（开发环境）及生产域名
    const allowed = /^http:\/\/localhost:\d+$/.test(origin) ||
                    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
    if (allowed) return cb(null, true);
    return cb(new Error('CORS 不允许的来源: ' + origin), false);
  },
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
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    fastify.log.info('Server is running on http://localhost:3001');

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
