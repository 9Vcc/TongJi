# 统计系统（tongji）

> 数据统计与福利管理平台。记录各厅（分部）人员每周业务数据（收光 / 麦序 / 全麦），按可配置奖励规则自动计算排名与福利，并提供可视化看板、数据录入、导出与审计能力。

---

## 目录

- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始（开发环境）](#快速开始开发环境)
- [Docker 部署（生产环境）](#docker-部署生产环境)
- [环境变量](#环境变量)
- [权限模型](#权限模型)
- [数据库迁移](#数据库迁移)
- [定时备份](#定时备份)
- [开发命令](#开发命令)
- [API 概览](#api-概览)
- [文档导航](#文档导航)

---

## 核心功能

- **数据看板**：可视化展示本周数据汇总、周对比、Top3 排名
- **数据录入**：支持手动录入、Excel 导入、表格粘贴导入
- **排名与福利**：按分部分组排名，自动计算基础福利和排名奖励
- **冠名转换**：按月统计的厅可配置多级冠名阈值，录入收光时按阈值整除转换
- **福利扣减**：独立扣减表，支持周/月周期扣减，最终福利 = 原福利 - 扣减
- **人员管理**：管理人员名单及分部归属（一个人员可属于多个分部）
- **系统设置**：配置奖励规则、管理账户、管理分部、配置冠名等级
- **数据导出**：导出 Excel / CSV 格式（周数据 / 月数据，可选历史周或历史月）
- **历史记录**：录入、修改、删除操作的完整审计日志（卡片入口 + 详情视图）
- **登录记录**：账户登录日志（仅会长可见，不含 IP 信息）
- **系统通知**：排名公布、规则变更等通知
- **备注系统**：所有数据操作（录入/编辑/批量/导入/删除）强制填写备注，便于追溯
- **暗色模式**：支持亮色/暗色主题切换
- **多语言界面**：全中文 UI

---

## 技术栈

### 后端

- **运行时**：Node.js 22+ / TypeScript 6
- **框架**：Fastify 5
- **ORM**：Prisma 7（使用 `@prisma/adapter-mariadb` 适配器）
- **数据库**：MariaDB 11（兼容 MySQL 协议）
- **认证**：JWT（`@fastify/jwt`）
- **文件上传**：`@fastify/multipart`（Excel 导入）
- **定时任务**：`node-cron`（数据库自动备份）
- **密码加密**：`bcryptjs`
- **Excel 处理**：`xlsx`
- **测试**：Vitest

### 前端

- **框架**：React 19 + TypeScript 6
- **构建工具**：Vite 8
- **样式**：TailwindCSS 3
- **路由**：React Router 7
- **HTTP**：Axios
- **图表**：Chart.js + react-chartjs-2
- **动画**：Framer Motion
- **图标**：lucide-react
- **拼音**：pinyin-pro（人员排序）

### 部署

- **容器化**：Docker + Docker Compose
- **反向代理**：Nginx（容器内置）
- **进程守护**：Docker `restart: unless-stopped`

---

## 项目结构

```
tongji/
├── client/                      # 前端（React + Vite）
│   ├── src/
│   │   ├── api/                  # API 请求封装
│   │   ├── components/           # 通用组件（Layout、Modal、Skeleton 等）
│   │   ├── hooks/                # 自定义 Hooks（useAuth、useTheme、useToast）
│   │   ├── pages/                # 页面
│   │   │   ├── Dashboard.tsx    # 数据看板
│   │   │   ├── DataEntry.tsx    # 数据录入
│   │   │   ├── Ranking.tsx       # 排名与福利
│   │   │   ├── Personnel.tsx    # 人员管理
│   │   │   ├── Login.tsx        # 登录
│   │   │   └── settings/        # 设置子页面
│   │   ├── types/                # TypeScript 类型定义
│   │   └── utils/                # 工具函数
│   ├── vite.config.ts            # Vite 配置（含 dev proxy）
│   └── package.json
│
├── server/                       # 后端（Fastify + Prisma）
│   ├── src/
│   │   ├── routes/               # API 路由
│   │   │   ├── auth.ts          # 认证（登录、登出、/me）
│   │   │   ├── accounts.ts      # 账户管理
│   │   │   ├── branches.ts      # 分部管理
│   │   │   ├── personnel.ts     # 人员管理
│   │   │   ├── data-records.ts  # 数据录入/修改/删除/导入
│   │   │   ├── data-query.ts    # 数据查询
│   │   │   ├── data-history.ts  # 历史记录
│   │   │   ├── dashboard.ts     # 看板数据
│   │   │   ├── ranking.ts       # 排名与福利
│   │   │   ├── reward-rules.ts  # 奖励规则
│   │   │   ├── naming-levels.ts# 冠名等级
│   │   │   ├── deductions.ts    # 福利扣减
│   │   │   ├── export.ts        # 数据导出
│   │   │   ├── notifications.ts # 系统通知
│   │   │   └── login-records.ts # 登录记录
│   │   ├── middleware/           # 中间件（认证、分部校验）
│   │   ├── services/             # 服务层（通知服务）
│   │   ├── utils/                # 工具（JWT、密码、周期、福利计算等）
│   │   ├── lib/                  # Prisma 客户端
│   │   └── index.ts              # 入口
│   ├── prisma/
│   │   ├── schema.prisma         # 数据模型定义
│   │   └── migrations/          # 数据库迁移文件
│   ├── scripts/
│   │   └── backup.ts             # 数据库备份脚本
│   ├── tests/                    # 单元测试
│   └── package.json
│
├── docker/
│   ├── entrypoint.sh             # 容器启动脚本
│   └── nginx.conf                # Nginx 配置
│
├── docs/                          # 项目文档
│   ├── user-manual.md            # 用户操作手册
│   ├── deployment-guide.md        # 部署指南
│   ├── database-design.md         # 数据库设计
│   └── code-wiki.md               # 代码百科
│
├── Dockerfile                     # 多阶段构建（前端+后端+Nginx）
├── docker-compose.yml             # 生产环境编排
├── docker-compose.dev.yml         # 开发环境（仅 MariaDB）
├── .env.example                   # 环境变量模板
└── package.json                   # 根 workspace（一键启动前后端）
```

---

## 快速开始（开发环境）

### 1. 环境准备

- Node.js 22+
- npm 10+
- Docker（用于启动 MariaDB）

### 2. 克隆项目

```bash
git clone <项目仓库地址>
cd tongji
```

### 3. 启动数据库

使用 Docker 启动 MariaDB（推荐）：

```bash
docker compose -f docker-compose.dev.yml up -d
```

连接信息：
- 主机：`127.0.0.1`
- 端口：`3306`
- 数据库：`tongji`
- 用户名：`tongji` / 密码：`tongji123`

### 4. 安装依赖

```bash
# 后端依赖
cd server
npm install

# 前端依赖
cd ../client
npm install
```

### 5. 配置环境变量

```bash
# 后端环境变量
cp server/.env.example server/.env
```

编辑 `server/.env`：

```env
DATABASE_URL="mysql://tongji:tongji123@127.0.0.1:3306/tongji"
JWT_SECRET="dev-secret-change-me-in-production-2026"
JWT_EXPIRES_IN="7d"
NODE_ENV="development"
```

### 6. 初始化数据库

```bash
cd server

# 生成 Prisma 客户端
npx prisma generate

# 执行数据库迁移
npx prisma migrate deploy

# （可选）打开 Prisma Studio 查看数据
npx prisma studio
```

### 7. 启动开发服务器

在项目根目录执行：

```bash
npm run dev
```

或分别启动：

```bash
# 后端（监听 [::]:3001，支持 IPv4/IPv6 双栈）
cd server && npm run dev

# 前端（监听 0.0.0.0:5173，支持内网穿透）
cd client && npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001
- Prisma Studio：http://localhost:5555（执行 `npx prisma studio` 后）

### 8. 初始化会长账户

首次启动后，调用种子接口创建默认会长账户：

```bash
curl -X POST http://localhost:3001/api/seed
```

默认账户：
- 用户名：`admin`
- 密码：`admin123`

> **重要**：首次登录后请立即修改密码。

---

## Docker 部署（生产环境）

### 1. 准备环境

- 已搭建的 MariaDB 实例（Docker 编排不包含数据库）
- Docker 24.0+ 及 Docker Compose 2.20+

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# MariaDB 连接串（必须使用 mysql:// 协议）
DATABASE_URL=mysql://用户名:密码@主机:端口/数据库名

# 对外暴露端口
APP_PORT=80

# JWT 密钥（生产环境必须修改！）
# 生成命令：openssl rand -base64 48
JWT_SECRET=your-strong-random-secret

# JWT 过期时间
JWT_EXPIRES_IN=7d

# 首次部署设为 1 初始化会长账户，后续更新部署设为 0
SEED_ADMIN=1
```

**DATABASE_URL 主机地址说明**：
- MariaDB 与 Docker 同宿主机：`host.docker.internal` 或 `172.17.0.1`
- MariaDB 在远程服务器：填写远程服务器 IP
- MariaDB 使用 Docker 独立容器：填写容器名或服务名

### 3. 构建并启动

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f app

# 停止
docker compose down
```

### 4. 首次初始化

首次部署时，确保 `.env` 中 `SEED_ADMIN=1`，容器启动后会自动调用 `/api/seed` 创建会长账户。

创建成功后，将 `SEED_ADMIN` 改回 `0`，避免后续更新部署重复初始化：

```env
SEED_ADMIN=0
```

### 5. 更新部署

```bash
# 拉取最新代码后重新构建
docker compose up -d --build
```

容器启动时会自动执行 `prisma migrate deploy` 应用新的数据库迁移。

### 6. 手动初始化会长账户

如果 `SEED_ADMIN=0` 但需要初始化会长账户：

```bash
docker exec tongji-app sh -c 'SEED_ADMIN=1 /entrypoint.sh'
```

或直接调用接口：

```bash
docker exec tongji-app wget -qO- --post-data='' http://127.0.0.1:3001/api/seed
```

---

## 环境变量

### 后端（server/.env）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | MariaDB 连接串（必须使用 `mysql://` 协议） | `mysql://tongji:tongji123@127.0.0.1:3306/tongji` |
| `JWT_SECRET` | JWT 签名密钥（生产环境必须修改） | `openssl rand -base64 48` 生成 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` / `24h` / `1h` |
| `NODE_ENV` | 运行环境 | `development` / `production` |

### Docker Compose（.env）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATABASE_URL` | MariaDB 连接串 | - |
| `APP_PORT` | 对外暴露端口 | `80` |
| `JWT_SECRET` | JWT 密钥 | `change-me-to-a-strong-random-secret` |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `SEED_ADMIN` | 是否初始化会长账户（`1`=是，`0`=否） | `0` |

---

## 权限模型

### 角色层级

```
会长（HUIZHANG, level 3）> 超管（CHAOGUAN, level 2）> 管理（GUANLI, level 1）
```

上级自动拥有下级所有权限。

### 权限矩阵

| 功能 | 会长 | 超管 | 管理 |
|------|:----:|:----:|:----:|
| 查看所有分部数据 | ✅ | ❌（仅本厅） | ❌（仅本厅） |
| 数据录入/编辑/导入 | ✅ | ✅ | ✅ |
| 删除数据 | ✅ | ✅ | ❌ |
| 数据导出 | ✅ | ✅ | ❌ |
| 管理账户 | ✅（所有角色） | ✅（仅管理） | ❌ |
| 管理分部 | ✅ | ❌ | ❌ |
| 配置奖励规则 | ✅ | ✅（仅本厅） | ❌ |
| 配置冠名等级 | ✅ | ❌ | ❌ |
| 福利扣减 | ✅ | ✅ | ❌ |
| 查看历史记录 | ✅ | ✅（仅本厅） | ❌ |
| 查看登录记录 | ✅ | ❌ | ❌ |
| 修改自己的昵称 | ✅ | ✅ | ✅ |

### 关键规则

- 会长可设置任意角色（含会长），超管只能设置管理
- 会长添加会长时 `branchId` 可为 null
- 会长可操作其他会长账户（仍不能操作自己）
- 超管/管理用户初始 `branchId` 锁定到 `user.branchId`
- 超管/管理用户无法通过 `viewAll` 参数查看全部厅数据
- 会长删除厅时需再次输入登录密码确认

---

## 数据库迁移

### 开发环境

```bash
cd server

# 创建新迁移（修改 schema.prisma 后）
npx prisma migrate dev --name <迁移名称>

# 应用迁移
npx prisma migrate deploy

# 重置数据库（慎用，会清空数据）
npx prisma migrate reset

# 生成 Prisma 客户端
npx prisma generate

# 同步 schema 到数据库（不生成迁移文件，仅开发环境）
npx prisma db push
```

### 生产环境

生产环境使用 `prisma migrate deploy`（仅应用已存在的迁移文件，不创建新迁移）：

```bash
# Docker 容器启动时自动执行
docker compose up -d --build

# 手动执行
docker exec tongji-app npx prisma migrate deploy
```

### 重要提示

- `prisma db push` 不会生成迁移文件，生产部署时 `migrate deploy` 无法应用这些变更
- 修改 schema 后必须使用 `prisma migrate dev --name <名称>` 生成迁移文件
- 迁移文件需提交到版本控制
- Prisma CLI 仅识别 `mysql://` 协议，不识别 `mariadb://`
- Linux 环境下 MariaDB 数据库名区分大小写

---

## 定时备份

系统内置数据库自动备份功能，每天凌晨 3:00 执行：

```bash
# 手动触发备份
docker exec tongji-app node dist/scripts/backup.js
```

备份文件存储在 Docker volume `app-backups` 中，映射到容器内 `/app/backups` 目录。

查看备份文件：

```bash
docker exec tongji-app ls -la /app/backups
```

---

## 开发命令

### 根目录（workspace）

```bash
# 同时启动前后端开发服务器
npm run dev

# 构建前后端
npm run build

# 运行测试
npm test
```

### 后端（server/）

```bash
npm run dev              # 启动开发服务器（tsx watch 热重载）
npm run build            # 编译 TypeScript
npm start                # 启动生产服务器
npm test                # 运行测试
npm run prisma:generate # 生成 Prisma 客户端
npm run prisma:migrate  # 创建并应用迁移
npm run prisma:studio   # 打开 Prisma Studio
```

### 前端（client/）

```bash
npm run dev      # 启动 Vite 开发服务器
npm run build    # 类型检查 + 构建
npm run lint     # 运行 oxlint
npm run preview  # 预览构建产物
```

### TypeScript 检查

```bash
# 后端
cd server && npx tsc --noEmit

# 前端
cd client && npx tsc --noEmit -p tsconfig.app.json
```

---

## API 概览

所有 API 以 `/api` 为前缀，需通过 `Authorization: Bearer <token>` 头携带 JWT。

### 认证

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 公开 |
| POST | `/api/auth/logout` | 登出 | 已认证 |
| GET | `/api/auth/me` | 获取当前用户 | 已认证 |
| PATCH | `/api/auth/me` | 更新自己的昵称 | 已认证 |
| POST | `/api/seed` | 初始化会长账户 | - |

### 账户管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/accounts` | 账户列表 | 超管+ |
| POST | `/api/accounts` | 创建账户 | 超管+ |
| PUT | `/api/accounts/:id` | 更新账户 | 超管+ |
| PATCH | `/api/accounts/:id/status` | 启用/禁用账户 | 超管+ |
| DELETE | `/api/accounts/:id` | 删除账户 | 超管+ |

### 分部管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/branches` | 分部列表 | 已认证 |
| POST | `/api/branches` | 创建分部 | 会长 |
| PUT | `/api/branches/:id` | 更新分部 | 会长 |
| DELETE | `/api/branches/:id` | 删除分部（需密码确认） | 会长 |

### 数据录入

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/data-records` | 录入（单条/批量） | 管理+ |
| PUT | `/api/data-records/:id` | 修改记录 | 管理+ |
| DELETE | `/api/data-records/:id` | 删除记录 | 超管+ |
| POST | `/api/data-records/import-excel` | Excel 导入 | 管理+ |
| POST | `/api/data-records/import-paste` | 粘贴导入 | 管理+ |

### 数据查询

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/data-query` | 查询数据 | 已认证 |
| GET | `/api/dashboard` | 看板数据 | 已认证 |
| GET | `/api/ranking` | 排名与福利 | 已认证 |
| GET | `/api/data-history` | 历史记录 | 超管+ |
| GET | `/api/login-records` | 登录记录 | 会长 |

### 配置

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET/PUT | `/api/reward-rules/:branchId` | 奖励规则 | 超管+ |
| GET/POST/PUT/DELETE | `/api/naming-levels` | 冠名等级 | 会长 |
| POST/DELETE | `/api/deductions` | 福利扣减 | 超管+ |
| GET | `/api/export` | 数据导出 | 超管+ |

---

## 文档导航

详细文档位于 [`docs/`](./docs) 目录：

- [用户操作手册](./docs/user-manual.md) — 面向终端用户的功能使用说明
- [部署指南](./docs/deployment-guide.md) — 详细的生产环境部署步骤
- [数据库设计](./docs/database-design.md) — 数据表结构与 ER 关系
- [代码百科](./docs/code-wiki.md) — 代码架构与模块说明

---

## 许可证

ISC
