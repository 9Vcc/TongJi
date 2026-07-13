# Code Wiki — 统计系统（tongji）

> 数据统计与福利管理平台。记录各厅（分部）人员每周业务数据（收光 / 麦序 / 全麦），按可配置奖励规则自动计算排名与福利，并提供可视化看板、数据录入、导出与审计能力。

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈与依赖](#2-技术栈与依赖)
3. [整体架构](#3-整体架构)
4. [数据模型](#4-数据模型)
5. [后端模块（server）](#5-后端模块server)
   - 5.1 [入口与启动](#51-入口与启动)
   - 5.2 [路由层 routes](#52-路由层-routes)
   - 5.3 [中间件 middleware](#53-中间件-middleware)
   - 5.4 [服务层 services](#54-服务层-services)
   - 5.5 [工具层 utils](#55-工具层-utils)
   - 5.6 [数据访问层 lib](#56-数据访问层-lib)
   - 5.7 [共享类型 types](#57-共享类型-types)
   - 5.8 [脚本 scripts](#58-脚本-scripts)
6. [前端模块（client）](#6-前端模块client)
   - 6.1 [入口与路由](#61-入口与路由)
   - 6.2 [API 封装层](#62-api-封装层)
   - 6.3 [Hooks](#63-hooks)
   - 6.4 [通用组件 components](#64-通用组件-components)
   - 6.5 [页面 pages](#65-页面-pages)
   - 6.6 [共享类型与工具](#66-共享类型与工具)
7. [核心算法说明](#7-核心算法说明)
8. [认证与权限模型](#8-认证与权限模型)
9. [主题系统](#9-主题系统)
10. [项目运行方式](#10-项目运行方式)
11. [测试与部署](#11-测试与部署)
12. [已知设计要点与注意事项](#12-已知设计要点与注意事项)

---

## 1. 项目概览

统计系统是一个前后端分离的单体应用，采用 monorepo 结构（根目录统一编排 `client/` 与 `server/`）。

**业务定位**：面向多厅（分部）运营场景，每周由管理角色录入人员的三项核心指标（收光 sg、麦序 mx、全麦 qm），系统依据各厅独立配置的奖励规则计算基础福利、排名奖励与总福利，并通过看板、排名页、导出功能呈现结果。

**核心能力**：

| 能力 | 说明 |
|------|------|
| 数据看板 | KPI 卡片、各厅指标柱状图、本期 vs 上期对比、Top3 排名，支持按周/按月周期切换 |
| 数据录入 | 手动单条录入、批量 Excel 导入、表格粘贴导入；同一人员同一周自动累加 |
| 排名与福利 | 按厅分组排名（1/2/3 名 + 麦序达标奖励），规则可视化展示 |
| 人员管理 | 人员可跨厅多对多归属；删除带数据保护 |
| 厅管理 | 厅增删改、统计周期（周/月）配置、奖励规则配置（5 项独立开关） |
| 账户管理 | 三级角色账户体系，会长可建会长，超管限本厅 |
| 历史审计 | 录入/修改/删除全量日志，按日期、人员、操作类型多维筛选 |
| 数据导出 | Excel / CSV 导出 |
| 系统通知 | 规则变更等通知下发与已读管理 |
| 数据库自动备份 | 每天 03:00 定时备份，保留 30 天 |

---

## 2. 技术栈与依赖

### 2.1 后端（server）

| 类别 | 依赖 | 用途 |
|------|------|------|
| Web 框架 | `fastify` ^5.8 | HTTP 服务、路由、插件体系 |
| CORS | `@fastify/cors` ^11 | 跨域配置 |
| 认证 | `@fastify/jwt` ^10 + `fast-jwt`（隐式） | JWT 签发与校验 |
| 文件上传 | `@fastify/multipart` ^10 | Excel 导入 |
| ORM | `@prisma/client` ^7.8 + `prisma` ^7.8 | 数据建模与访问 |
| 数据库驱动 | `@prisma/adapter-better-sqlite3` ^7.8 + `better-sqlite3` ^12 | SQLite 适配器 |
| 密码 | `bcryptjs` ^3 | 密码加盐哈希 |
| Excel | `xlsx` ^0.18 | Excel 解析与生成 |
| CSV | `json2csv` ^6 | CSV 生成 |
| 定时任务 | `node-cron` ^4.5 | 数据库备份调度 |
| 配置 | `dotenv` ^17 | 环境变量 |
| 测试 | `vitest` ^4.1 | 单元测试 |
| 运行时 | `tsx` ^4.22（开发）、`tsc`（构建） | TS 执行与编译 |

### 2.2 前端（client）

| 类别 | 依赖 | 用途 |
|------|------|------|
| 框架 | `react` ^19.2 + `react-dom` ^19.2 | UI 框架 |
| 路由 | `react-router-dom` ^7.18 | 客户端路由 |
| 构建 | `vite` ^8.1 + `@vitejs/plugin-react` ^6 | 构建工具 |
| 样式 | `tailwindcss` ^3.4 + `postcss` + `autoprefixer` | 原子化 CSS |
| HTTP | `axios` ^1.18 | API 调用 |
| 图表 | `chart.js` ^4.5 + `react-chartjs-2` ^5.3 | 数据可视化 |
| 动画 | `framer-motion` ^12.41 | 页面/组件过渡动画 |
| 图标 | `lucide-react` ^1.21 | 图标库 |
| 语言 | `typescript` ~6.0 | 类型系统 |
| Lint | `oxlint` ^1.69 | 代码检查 |

> 注：`lightweight-charts` 在依赖中存在，但当前代码库未使用（K 线图功能已移除）。

---

## 3. 整体架构

### 3.1 目录结构

```
tongji/
├── package.json              # 根编排：dev/build/test 统一脚本
├── client/                   # 前端（React + Vite）
│   ├── src/
│   │   ├── api/index.ts      # axios 实例 + 全部 API 封装
│   │   ├── hooks/            # useAuth / useTheme / useToast（Context Provider）
│   │   ├── components/       # Layout / Modal / Skeleton 等通用组件
│   │   ├── pages/            # 业务页面 + settings/ 子页面
│   │   ├── types/index.ts    # 前端共享类型
│   │   ├── utils/index.ts    # 日期/角色等工具函数
│   │   ├── App.tsx           # 路由定义 + ProtectedLayout
│   │   └── main.tsx          # Provider 组装与挂载
│   ├── vite.config.ts        # Vite 配置（无 proxy）
│   └── tailwind.config.js    # 主题色彩系统
├── server/                   # 后端（Fastify + Prisma + SQLite）
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型定义
│   │   └── migrations/       # 数据库迁移
│   ├── src/
│   │   ├── index.ts          # Fastify 启动 + 插件/路由注册 + 备份调度
│   │   ├── routes/           # 12 个路由模块
│   │   ├── middleware/       # auth / branch 中间件
│   │   ├── services/         # notification 通知服务
│   │   ├── utils/            # jwt / password / period / week / welfare
│   │   ├── lib/prisma.ts     # Prisma 客户端初始化
│   │   └── types/index.ts    # JwtPayload 等共享类型
│   ├── scripts/backup.ts     # 数据库备份脚本
│   ├── tests/                # vitest 测试
│   └── generated/prisma/     # Prisma 生成产物（gitignore）
└── docs/                     # 文档（database-design / deployment-guide / user-manual）
```

### 3.2 分层架构

**后端分层**：

```
HTTP 请求
  → Fastify 插件层（cors / jwt / multipart）
  → 路由层 routes/*.ts（参数校验 + 权限守卫 + 业务编排）
  → 中间件 middleware/auth.ts（authenticate + requireRole）
  → 工具层 utils/welfare.ts（核心算法：computeRanking）
  → 服务层 services/notification.ts（领域服务）
  → 数据访问 lib/prisma.ts（PrismaClient 实例）
  → SQLite（dev.db）
```

**前端分层**：

```
浏览器
  → main.tsx（Provider 组装：BrowserRouter → Theme → Toast → Auth）
  → App.tsx 路由（ProtectedLayout 守卫登录 + Layout 常驻）
  → pages/*.tsx（业务页面，内部做角色权限判断）
  → components/*.tsx（通用 UI）
  → hooks/*.tsx（全局状态 Context）
  → api/index.ts（axios 封装，token 注入 + 401 拦截）
  → 后端 API（http://localhost:3001/api）
```

### 3.3 前后端交互

- 前端通过 `axios.create({ baseURL: 'http://localhost:3001/api' })` 直连后端（**未配置 Vite proxy**，依赖后端 CORS）。
- 认证：登录后 JWT 存 `localStorage`，请求拦截器注入 `Authorization: Bearer <token>`，响应拦截器遇 401 清 token 并跳登录。
- 通信格式：JSON；文件上传用 `multipart/form-data`；导出用 `blob`。

---

## 4. 数据模型

数据库为 SQLite（`server/dev.db`），通过 Prisma 建模，共 **8 张表 + 5 个枚举**。详细字段见 [database-design.md](./database-design.md)，此处给出核心实体关系概览。

### 4.1 枚举

| 枚举 | 值 | 说明 |
|------|----|------|
| `Role` | HUIZHANG / CHAOGUAN / GUANLI | 会长 / 超管 / 管理 |
| `AccountStatus` | ACTIVE / DISABLED | 账户启停 |
| `HistoryAction` | UPDATE / DELETE | 历史操作类型 |
| `StatCycle` | WEEK / MONTH | 统计周期 |
| `NotificationType` | RANK_PUBLISH / RULE_CHANGE / DATA_CHANGE | 通知类型 |

### 4.2 实体关系

```
Account ──(branchId)──► Branch ◄──(branchId)── DataRecord ──(personnelId)──► Personnel
   │                       │  ▲                     │  ▲                       │
   │                       │  │                     │  │                       │
   │                       ├──┘ (RewardRule 1:1)    │  │                       │
   │                       │                        │  │                       │
   │                       ├──(Notification 1:N)    │  │                       │
   │                       │                        │  │                       │
   └──(modifierId)──► DataHistory ◄──(recordId)────┘  │                       │
                                                       │                       │
                          PersonnelBranch ◄──(branchId)┘ ───(personnelId)──────┘
                              (人员-厅 多对多关联表)
```

**关键关系**：

- `Account.branchId` 可空（会长无厅）。
- `Personnel` 与 `Branch` 为多对多，通过 `PersonnelBranch` 关联（联合唯一约束）。
- `Branch` 与 `RewardRule` 一对一（每厅一套规则）。
- `DataHistory.recordId` 可空（记录被删除后置 null，`onDelete: SetNull`）。

### 4.3 核心表 DataRecord

存储每周人员数据，是业务核心表，含三类指标字段：

| 字段 | 含义 |
|------|------|
| `weekStart` | 所属周周一 00:00:00（精确匹配查询键） |
| `sg` | 收光数量 |
| `mx` | 麦序数量 |
| `qm` | 全麦数量 |
| `createdBy` | 创建者账户 ID |

建有多组组合索引以优化按周/按厅/按人员查询性能（详见 `schema.prisma`）。

---

## 5. 后端模块（server）

### 5.1 入口与启动

**文件**：[`server/src/index.ts`](../server/src/index.ts)

**职责**：Fastify 实例创建、插件注册、路由挂载、定时任务调度、服务启动。

**关键流程**：

1. 创建 `Fastify({ logger: true })` 实例。
2. 注册三个插件：
   - `cors`：允许 `localhost` / `127.0.0.1` 任意端口（开发环境）。
   - `jwt`：secret 使用 `utils/jwt.ts` 导出的 `JWT_SECRET`（启动时强制校验）。
   - `multipart`：文件上传，限制 10MB。
3. 依次注册 12 个路由模块（见 5.2）。
4. 注册根路由：
   - `GET /health` — 健康检查，返回 `{ status, timestamp }`。
   - `GET /` — 服务信息。
   - `POST /api/seed` — 初始化默认会长账户（`admin` / `admin123`，仅当不存在时创建）。
5. `start()` 启动监听 `0.0.0.0:3001`，并通过 `node-cron` 注册每天 03:00 的 `runBackup()` 定时备份任务。

### 5.2 路由层 routes

所有路由以 Fastify 插件形式注册，统一前缀 `/api`。权限通过 `preHandler: [authenticate, requireRole(...)]` 守卫。

#### 5.2.1 auth.ts — 登录认证

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| POST | `/api/auth/login` | 公开 | 登录：校验账户状态 → bcrypt 比对 → 签发 JWT，返回 `{ token, user }` |
| GET | `/api/auth/me` | authenticate | 获取当前登录用户信息 |

#### 5.2.2 accounts.ts — 账户管理

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| POST | `/api/accounts` | CHAOGUAN+ | 添加账户（会长可建会长且 branchId 可空；超管只能建本厅 GUANLI） |
| GET | `/api/accounts` | CHAOGUAN+ | 账户列表（超管仅本厅 GUANLI；会长全部含 HUIZHANG） |
| PATCH | `/api/accounts/:id/status` | CHAOGUAN+ | 启用/禁用账户（不能操作自己；非会长不能操作会长） |
| DELETE | `/api/accounts/:id` | CHAOGUAN+ | 删除账户（不能删自己） |
| PUT | `/api/accounts/:id` | CHAOGUAN+ | 更新账户（会长可设任意角色；超管只能设 GUANLI 且锁定本厅） |

**关键函数**：各路由内部自行实现分部权限校验（未使用 `middleware/branch.ts`）。

#### 5.2.3 branches.ts — 厅管理

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| POST | `/api/branches` | CHAOGUAN+ | 创建厅（事务中同时创建默认 RewardRule） |
| GET | `/api/branches` | authenticate | 厅列表（会长全部；非会长仅本厅），含 `_count` 聚合 |
| PUT | `/api/branches/:id` | CHAOGUAN+ | 更新厅名称/统计周期（超管限本厅；name 用 `findFirst` 去重） |
| DELETE | `/api/branches/:id` | CHAOGUAN+ | 删除厅（有 dataRecords 时禁止；事务清理关联） |

#### 5.2.4 personnel.ts — 人员管理

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| POST | `/api/personnel` | CHAOGUAN+ | 添加人员（同名人员全局复用，仅建关联；否则事务建人员+关联） |
| GET | `/api/personnel` | authenticate | 人员列表（带本周数据状态 `hasDataThisWeek` / `weekData`） |
| DELETE | `/api/personnel/:id?branchId=` | CHAOGUAN+ | 移除人员（有数据禁止；仅属一厅时连同人员删除） |

> 注：本文件内部重复定义了 `getWeekStart`，未复用 `utils/week.ts`。

#### 5.2.5 data-records.ts — 数据录入/修改/删除（核心）

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| POST | `/api/data-records` | GUANLI+ | 手动录入（单条 + 批量 `records` 数组，事务 upsert 累加） |
| POST | `/api/data-records/import-excel` | GUANLI+ | Excel 导入（multipart，xlsx 解析逐行校验 upsert） |
| POST | `/api/data-records/import-paste` | GUANLI+ | 表格粘贴导入（支持 Tab/逗号分隔） |
| PUT | `/api/data-records/:id` | GUANLI+ | 修改数据（事务内写 DataHistory；改人员时合并去重） |
| DELETE | `/api/data-records/:id` | HUIZHANG, CHAOGUAN | 删除数据（超管限本厅；事务内先写 DELETE 历史） |
| GET | `/api/data-records/:id/history` | GUANLI+ | 单条记录修改历史 |

**关键内部函数**：

- `validateRecordInput(input)` — 校验 personnelId / branchId / sg / mx / qm 均为非负整数。
- `resolveBranchId(currentUser, requestedBranchId)` — 会长可指定任意厅；非会长强制本厅，跨厅报错。
- `upsertRecord(tx, input, createdBy, weekStart)` — 同人同周同厅唯一，已存在则累加 sg/mx/qm，否则新建。
- `findPersonnelInBranch(name, branchId)` — 通过 PersonnelBranch 反查人员。

#### 5.2.6 data-query.ts — 数据查询

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/data-records` | authenticate | 按周查询数据（含简化版 welfare 计算） |
| GET | `/api/weeks` | authenticate | 历史周列表（distinct weekStart 倒序） |
| GET | `/api/data-records/compare` | authenticate | 两周数据对比（按 `branchId:personnelId` 对齐） |

**注意**：本文件内有一份**简化版 `calcWelfare`**（含 maixuBonus，不含排名奖励），与 `utils/welfare.ts` 的正式版不同——此处用于单条记录展示。

#### 5.2.7 reward-rules.ts — 奖励规则

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/reward-rules` | authenticate | 查询规则（会长可指定/全部；非会长本厅） |
| PUT | `/api/reward-rules/:branchId` | CHAOGUAN+ | 更新规则（超管限本厅；数值校验非负整数；布尔校验；upsert；更新后发 RULE_CHANGE 通知） |

#### 5.2.8 ranking.ts — 排名

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/ranking` | authenticate | 周期排名（支持 weekStart / branchId / cycle / viewAll） |

**关键逻辑**：

- `resolveRankingBranchId`：会长可指定或全部；**超管/管理始终限本厅**（`viewAll` 参数被忽略，仅前端用于切换周/月维度）。
- `resolveCycleParam`：显式 cycle 优先；否则 `resolveCycle(branchFilter)`（未指定厅=全部 → WEEK；单厅 → 该厅 statCycle）。
- 调用 `computeRanking(refDate, branchFilter, cycle)` 返回排名列表。

#### 5.2.9 dashboard.ts — 数据看板

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/dashboard/summary` | authenticate | 本期汇总（computeRanking + aggregate） |
| GET | `/api/dashboard/top3` | authenticate | Top3 排名（过滤 rank ≤ 3） |
| GET | `/api/dashboard/compare` | authenticate | 周期对比（本期 vs 上期，并行 computeRanking） |

**关键函数**：`aggregate(ranking)` 对排名列表求和，返回 `{ personnelCount, totalSG, totalMX, totalQM, totalWelfare }`。

#### 5.2.10 export.ts — 数据导出

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/export/excel` | authenticate | 导出 Excel（xlsx buffer，中文表头） |
| GET | `/api/export/csv` | authenticate | 导出 CSV（json2csv，前置 BOM） |

#### 5.2.11 notifications.ts — 系统通知

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/notifications` | authenticate | 通知列表（按 createdAt 倒序） |
| PATCH | `/api/notifications/:id/read` | authenticate | 标记已读（非会长限本厅） |

#### 5.2.12 data-history.ts — 录入历史记录（审计）

| 方法 | 路径 | 权限 | 用途 |
|------|------|------|------|
| GET | `/api/data-history` | CHAOGUAN+ | 综合查询录入与修改历史 |

**查询参数**：`weekStart?` / `date?(YYYY-MM-DD)` / `branchId?` / `personnelId?` / `modifierId?` / `type?(create|update|delete)` / `limit?(默认100, 上限500)`

**核心逻辑**：

- `date` 参数解析为当天 `[00:00, 次日 00:00)` 范围；创建记录按 `createdAt` 过滤，修改/删除按 `modifyTime` 过滤。
- 超管强制本厅；会长可指定或全部。
- 统一 `LogItem` 结构，合并 DataRecord（type=create）与 DataHistory（type=update/delete），按 time 倒序。
- 已删除记录的 personnelName/branchName 回退为占位文本。

### 5.3 中间件 middleware

#### auth.ts

- **`authenticate(request, reply)`**：从 `Authorization: Bearer <token>` 提取并 `verifyToken`，成功挂载 `request.user`（类型 `JwtPayload`），失败返回 401。
- **`requireRole(...roles: Role[])`**：中间件工厂。基于 `ROLE_LEVEL`（HUIZHANG=3 / CHAOGUAN=2 / GUANLI=1），取传入 roles 最低等级为门槛，用户等级 ≥ 门槛即放行。未传 roles 时允许所有已认证用户。

`request.user` 字段：`{ id: number; username: string; role: Role; branchId: number | null }`

#### branch.ts

- **`requireBranchAccess(request, reply)`**：会长放行；从 params/query 读 branchId 校验是否等于 `user.branchId`。
- **注意**：经全代码检索，该中间件**实际未被任何路由注册使用**，各路由均自行实现分部权限校验。属于预留/冗余中间件。

### 5.4 服务层 services

#### notification.ts

- **`createNotification(branchId, type, content)`**：向 Notification 表插入一条记录。
- **调用方**：仅 `reward-rules.ts` 的 PUT 接口在规则更新后调用，创建 `RULE_CHANGE` 通知。
- 默认导出 `{ createNotification }`。

### 5.5 工具层 utils

#### jwt.ts

- 常量：`JWT_SECRET`（从 `process.env.JWT_SECRET` 读取并导出，启动时校验存在且长度 >= 16，否则 `process.exit(1)`），`JWT_EXPIRES_IN = '7d'`。
- 使用 `fast-jwt` 的 `createSigner` / `createVerifier` 预创建实例。
- **`signToken(payload: JwtPayload): string`** — 签发。
- **`verifyToken(token: string): JwtPayload`** — 验证解码。

#### password.ts

- 常量：`SALT_ROUNDS = 10`。
- **`hashPassword(password): Promise<string>`** — bcryptjs 加盐哈希。
- **`comparePassword(password, hash): Promise<boolean>`** — 比对。

#### week.ts

- **`getWeekStart(date = new Date()): Date`** — 返回本周一 00:00:00。算法：周日 diff=-6，其他 diff=1-day，然后时分秒归零。

#### period.ts — 统计周期计算

基于 `StatCycle`（WEEK/MONTH）抽象"周期"概念。

| 函数 | 说明 |
|------|------|
| `getMonthStart(date?)` | 所在月 1 号 00:00:00 |
| `getMonthEnd(date?)` | 下月 1 号 00:00:00（范围上界，不含） |
| `getPreviousMonthStart(date?)` | 上月 1 号 00:00:00 |
| `getPeriodStart(cycle, date?)` | WEEK → getWeekStart；MONTH → getMonthStart |
| `getPeriodEnd(cycle, date?)` | WEEK → 当前+7 天；MONTH → getMonthEnd |
| `getPreviousPeriodStart(cycle, date?)` | WEEK → 当前-7 天的 getWeekStart；MONTH → getPreviousMonthStart |

#### welfare.ts — 福利计算与排名核心

**类型**：

- `RankingItem` — 排名结果项（含 rank / baseWelfare / rankReward / totalWelfare 等）。
- `RewardRuleLike` — 奖励规则结构（含 5 个开关）。

**常量**：`DEFAULT_RULE` — 分部未配置规则时的回退默认值（sgRatio=3, qmRatio=3, rank1/2/3=100/80/60, maixuThreshold=40, maixuReward=52，开关默认开，maixuMinEnabled 默认关）。

**核心函数**：

- **`computeBaseWelfare(sg, qm, rule): number`**
  - `sgPart = sgEnabled ? sg * sgRatio : 0`
  - `qmPart = qmEnabled ? qm * qmRatio : 0`
  - 返回 `sgPart + qmPart`（基础福利不含麦序奖励）。

- **`computeRankReward(rank, mx, rule): number`**
  - `rankEnabled=false` → 0
  - rank=1/2/3 → rank1/2/3Reward
  - rank≥4 且 `maixuEnabled && mx >= maixuThreshold` → maixuReward
  - 否则 0

- **`resolveQueryBranchId(currentUser, requestedBranchId): number | undefined`**
  - 会长可指定或全部（undefined）；非会长锁定 `currentUser.branchId`。

- **`resolveCycle(branchFilter?): Promise<StatCycle>`**
  - 未指定分部（全部厅）→ WEEK（保证混合周期一致性）。
  - 指定单厅 → 查 branch.statCycle；查不到回退 WEEK。

- **`computeRanking(refDate, branchFilter?, cycle=WEEK): Promise<RankingItem[]>`** — 核心算法，详见 [第 7 节](#7-核心算法说明)。

### 5.6 数据访问层 lib

#### prisma.ts

- 读取 `process.env.DATABASE_URL`，默认 `file:./dev.db`，去除 `file:` 前缀。
- 使用 `@prisma/adapter-better-sqlite3` 的 `PrismaBetterSqlite3` 适配器。
- 通过 `new PrismaClient({ adapter })` 创建实例，同时提供默认导出与命名导出 `prisma`（同一实例）。
- Prisma 生成产物位于 `server/generated/prisma/client`。

### 5.7 共享类型 types

#### index.ts

- **`JwtPayload`** 接口：`{ id, username, role, branchId: number | null }`。
- 模块增强 `declare module '@fastify/jwt'`，为 `FastifyJWT` 添加 `payload` 与 `user` 字段，使全应用 `request.user` 类型安全。

### 5.8 脚本 scripts

#### backup.ts

- **`runBackup(): string | null`** — 复制 `dev.db` 到 `server/backups/backup-YYYY-MM-DD-HH-mm-ss.db`，并清理超过 30 天的旧备份。
- 直接执行：`tsx scripts/backup.ts`；定时执行：由 `index.ts` 中 `node-cron` 每天 03:00 调用。
- 常量：`RETENTION_DAYS = 30`。

---

## 6. 前端模块（client）

### 6.1 入口与路由

#### main.tsx

用 `createRoot` 挂载到 `#root`（`StrictMode`）。Provider 嵌套顺序（外→内）：

```
BrowserRouter → ThemeProvider → ToastProvider → AuthProvider → App
```

引入 `./index.css`（Tailwind 指令 + CSS 变量）。

#### App.tsx

**`ProtectedLayout`**：受保护布局路由。

- 从 `useAuth()` 取 `user, loading`；loading 显示「加载中...」。
- 未登录 `<Navigate to="/login" />`。
- 已登录渲染 `<Layout>` 包裹 `<AnimatePresence mode="wait"><PageTransition key={pathname}><Outlet /></PageTransition></AnimatePresence>` —— **Layout 只挂载一次**，避免路由切换时 `sidebarCollapsed` 等状态丢失。

**路由表**：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | Login | 公开 |
| `/` | Dashboard | 数据看板 |
| `/data` | DataEntry | 数据录入 |
| `/ranking` | Ranking | 排名与福利 |
| `/personnel` | Personnel | 人员管理 |
| `/settings` | Settings | 设置入口 |
| `/settings/accounts` | Accounts | 账户管理 |
| `/settings/branches` | Branches | 厅管理 |
| `/settings/notifications` | Notifications | 通知列表 |
| `/settings/history` | DataHistory | 录入历史记录 |
| `*` | → `/` | 兜底重定向 |

> **注意**：路由层只做登录校验，**角色级权限不在路由层做**，由各页面内部判断显示「无权访问」。

### 6.2 API 封装层

**文件**：[`client/src/api/index.ts`](../client/src/api/index.ts)

#### axios 实例

- `request = axios.create({ baseURL: 'http://localhost:3001/api', timeout: 30000 })`（**硬编码，无 proxy**）。
- **请求拦截器**：从 `localStorage['token']` 注入 `Authorization: Bearer <token>`。
- **响应拦截器**：成功 `return response.data`（返回后端数据本体）；401 时清 token 并跳 `/login`（登录页不跳避免循环）。
- **`getErrorMessage(error): string`** — 优先 `error.response.data.error`，回退 `error.message`，兜底「未知错误」。

#### API 对象清单

| 对象 | 方法 | 说明 |
|------|------|------|
| `authApi` | `login` / `getMe` / `seed` | 登录、当前用户、种子初始化 |
| `accountsApi` | `list` / `create` / `update` / `updateStatus` / `delete` | 账户增删改查、启停 |
| `branchesApi` | `list` / `create` / `update` / `delete` | 厅管理 |
| `personnelApi` | `list(branchId?)` / `create` / `delete(id, branchId)` | 人员管理 |
| `dataRecordsApi` | `list` / `create` / `importExcel` / `importPaste` / `update` / `delete` / `getHistory` | 数据录入核心 |
| `dataQueryApi` | `listByWeek` / `getWeeks` / `compare` | 周查询、历史周、周对比 |
| `rewardRulesApi` | `get(branchId?)` / `update(branchId, data)` | 奖励规则 |
| `rankingApi` | `getRanking(weekStart?, branchId?, cycle?, viewAll?)` | 排名查询 |
| `dashboardApi` | `getSummary` / `getTop3` / `getCompare` | 看板汇总、Top3、对比 |
| `exportApi` | `exportExcel` / `exportCSV` | 导出（responseType: 'blob'） |
| `dataHistoryApi` | `list(params?)` | 录入历史日志查询 |
| `notificationsApi` | `list(branchId?)` / `markRead(id)` | 通知列表、标记已读 |

### 6.3 Hooks

#### useAuth.tsx

- **职责**：管理当前登录用户认证状态。
- **Provider**：`AuthProvider`。
- **State**：`user: User | null`、`loading: boolean`。
- **方法**：`login(username, password)`（写 token + setUser）、`logout()`、`refreshUser()`（挂载时自动调用一次，从 token 恢复 user）。
- value 用 `useMemo` 稳定。

#### useTheme.tsx

- **职责**：主题切换（light / dark / auto）。
- **Provider**：`ThemeProvider`。
- **State**：`theme`（用户选择）、`resolvedTheme`（实际应用）。
- **逻辑**：`readStoredTheme()` 读 localStorage（默认 'auto'）；`getSystemTheme()` 用 `matchMedia` 检测系统主题；`applyTheme()` 在 `<html>` 上增删 `dark` 类；auto 模式监听系统主题变化实时响应。
- **暴露**：`{ theme, resolvedTheme, setTheme, toggleTheme }`（toggle 按 light→dark→auto 循环）。

#### useToast.tsx

- **职责**：全局 Toast 通知系统，右上角浮动卡片。
- **Provider**：`ToastProvider`，渲染固定容器（`fixed top-4 right-4 z-[100]`）。
- **方法**：`show(message, type)` / `success` / `error` / `info`。3 秒自动消失。
- **实现**：`ToastView` 子组件用 framer-motion `AnimatePresence` 做入场（x:100→0, scale 0.9→1）/出场动画，不同 type 显示不同图标与背景色。

### 6.4 通用组件 components

| 组件 | 文件 | 职责 | 关键 Props |
|------|------|------|-----------|
| `Layout` | Layout.tsx | 主框架：侧边栏 + header + 主内容区 | `children` |
| `Modal` | Modal.tsx | a11y 模态弹窗（焦点陷阱、ESC、焦点恢复） | `open` / `title` / `onClose` / `children` / `footer` / `width` |
| `PageTransition` | PageTransition.tsx | 页面切换淡入上移动画 | `children` |
| `SearchableSelect` | SearchableSelect.tsx | 带搜索过滤的下拉选择（仅输入时显示列表） | `value` / `onChange` / `options` / `placeholder` / `disabled` / `renderOption` |
| `Skeleton` | Skeleton.tsx | 骨架屏组件集合 | `KpiCardSkeleton` / `ChartSkeleton` / `TableSkeleton` / `Spinner` 等 |
| `SubPageHeader` | SubPageHeader.tsx | 设置子页面头部（返回 + 标题 + 描述） | `title` / `desc` / `children` |
| `ThemeToggle` | ThemeToggle.tsx | 主题切换下拉菜单（顶栏） | 无（消费 useTheme） |
| `AnimatedNumber` | AnimatedNumber.tsx | 数字滚动动画（KPI 用，rAF + easeOutCubic） | `value` / `duration?` / `format?` / `decimals?` |

**Layout 关键设计**：

- `sidebarOpen`（移动端抽屉）、`sidebarCollapsed`（桌面端折叠）双状态。
- 5 项导航：`/` 数据看板、`/data` 数据录入、`/ranking` 排名与福利、`/personnel` 人员管理、`/settings` 系统设置（`/` 用 `end` 精确匹配）。
- 路由变化时拉取 `notificationsApi.list()`，未读数显示红点徽章。
- 桌面端侧边栏右边缘圆形按钮切换折叠（w-60 ↔ w-16），主内容 `lg:ml-60` / `lg:ml-16` 联动。

**Modal 关键设计**：用 `useRef` 持有 `previouslyFocused` 与 `onCloseRef`，避免父组件内联函数变化导致 effect 重复绑定（修复了输入框失焦问题）。

### 6.5 页面 pages

#### Login.tsx

登录页。用户名/密码表单（浮动标签），提交调用 `useAuth().login`，成功后 toast + 跳 `/`。底部提示默认账户。

#### Dashboard.tsx — 数据看板（首页）

- **功能**：周期选择器（按周/按月）、上/下周期、回到本期；4 张 KPI 卡片（人员数、总收光、总麦序、总福利，含与上期对比趋势）；各厅三指标柱状图；本期 vs 上期对比柱状图；Top3 排名。
- **API**：`branchesApi.list`、`dataQueryApi.getWeeks`、`dashboardApi.getSummary/getCompare/getTop3`、`rankingApi.getRanking`。
- **权限要点**：会长可在「全部厅」与具体厅间切换；非会长锁定 `user.branchId`，但可通过「按月统计」按钮切换本厅周/月视图（请求 `viewAll=true`）。`currentCycle`：会长选全部厅→MONTH；非会长开启按月→MONTH；否则跟随厅 statCycle。
- **图表**：Chart.js Bar，主题色随 `resolvedTheme` 切换。

#### DataEntry.tsx — 数据录入（核心业务页）

- **功能**：周次切换、按周/按月徽章、（会长）厅选择、导入、导出 Excel/CSV；手动录入表单（人员 SearchableSelect + 三数值）；本周录入明细表格（编辑/删除）；按月统计厅额外展示「本月汇总」卡片；导入弹窗（Excel 上传 / 表格粘贴双 Tab）。
- **API**：`dataQueryApi.listByWeek`、`personnelApi.list`、`branchesApi.list`、`rankingApi.getRanking`（按月汇总）、`dataRecordsApi.*`、`exportApi.*`。
- **权限要点**：`canDelete = isHuizhang || isChaoguan`（GUANLI 无删除）；`effectiveBranchId` 非会长强制 `user.branchId`。

#### Ranking.tsx — 排名与福利

- **功能**：周期选择器、（会长）厅切换含「全部厅」；排名表格（Top3 徽章金/灰/铜 + 行背景）；「福利计算说明」9 张 RuleCard 展示当前规则。
- **API**：`rankingApi.getRanking`、`rewardRulesApi.get`、`dataQueryApi.getWeeks`、`branchesApi.list`。
- **子组件**：`RuleCard({ label, value, desc, enabled? })` — enabled=false 时显示「已关闭」徽章 + 删除线。

#### Personnel.tsx — 人员管理

- **功能**：人员表格（姓名、所属厅多厅顿号连接、本周数据状态徽章、操作）；添加人员弹窗；删除人员。
- **API**：`personnelApi.list/create/delete`、`branchesApi.list`。
- **权限要点**：`canDelete = canAdd = isHuizhang || isChaoguan`（GUANLI 只读）。

#### Settings.tsx — 设置入口

4 张卡片入口（账户管理 / 厅管理 / 通知列表 / 录入历史记录），通过 `visible` 控制可见性：

- 账户管理 / 厅管理 / 录入历史记录：`isHuizhang || isChaoguan`
- 通知列表：所有人可见
- GUANLI 用户仅看到「通知列表」。

#### settings/Accounts.tsx — 账户管理

- **功能**：账户列表、添加/编辑账户弹窗（用户名、密码带显示切换、角色、所属厅）、启停、删除。
- **权限要点**：
  - 会长：看到所有 CHAOGUAN/GUANLI/HUIZHANG 账户（排除自己）；角色可选 HUIZHANG/CHAOGUAN/GUANLI；所属厅可不绑定（会长角色）。
  - 超管：仅看本厅 GUANLI；只能创建 GUANLI；强制使用自己 branchId。
  - 编辑时仅提交变更字段（diff），密码留空不修改。

#### settings/Branches.tsx — 厅管理 + 奖励规则配置

- **功能**：厅列表（名称、统计周期徽章、人员数、数据数、操作）；添加/编辑厅弹窗（名称 + 统计周期）；奖励规则弹窗（5 组 ToggleRow + NumberInput，每项独立开关）。
- **API**：`branchesApi.*`、`rewardRulesApi.get/update`。
- **权限要点**：`canManage = isHuizhang || isChaoguan`；仅会长可创建/删除厅；删除按钮在 `dataRecordCount > 0` 时禁用。
- **默认规则** `defaultRuleForm`：sgRatio=3, qmRatio=3, rank1/2/3=100/80/60, maixuThreshold=40, maixuReward=52, maixuMinStandard=0，开关默认开（maixuMinEnabled 默认关）。

#### settings/Notifications.tsx — 通知列表

拉取所有通知，按类型显示不同图标，点击项 markRead。所有人可访问。

#### settings/DataHistory.tsx — 录入历史记录（审计）

- **功能**：筛选栏（操作类型、操作日期日历选择器、厅仅会长、人员 SearchableSelect）；历史记录表格（时间、操作人、操作徽章、人员、厅、所属周、详情）。
- **详情渲染** `renderDetail(log)`：
  - create：显示「收光 X · 麦序 Y · 全麦 Z」。
  - delete：解析 oldValue JSON 显示删除前数据。
  - update + field==='personnelId'：用 `personnelMap` 翻译为人员名「人员：张三 → 李四」。
  - update 其他字段：用 `FIELD_MAP`（sg→收光、mx→麦序、qm→全麦、personnelId→人员）显示「字段: 旧值 → 新值」。
- **权限要点**：`canView = isHuizhang || isChaoguan`；超管后端自动限本厅。
- **交互细节**：`autoBranchRef` 用 ref 标记「人员选中时自动设置的 branchId」，避免触发「厅变化清空人员」的副作用 effect。

### 6.6 共享类型与工具

#### types/index.ts

核心实体接口（节选）：

- `Role` / `AccountStatus` / `StatCycle` / `HistoryAction` / `DataLogType` — 字面量联合类型。
- `User`、`LoginResponse`、`Branch`、`Personnel`、`DataRecord`、`DataHistory`、`RewardRule`、`Notification`、`RankingItem`、`DashboardSummary`、`DashboardCompare`、`WeekCompareItem`、`ImportResult`、`DataLogItem`。
- 入参接口：`CreateAccountInput` / `UpdateAccountInput` / `CreatePersonnelInput` / `CreateRecordInput` / `UpdateRecordInput` / `UpdateRewardRuleInput`。

#### utils/index.ts

| 函数 | 签名 | 说明 |
|------|------|------|
| `getWeekStart(date?)` | `→ Date` | 本周一 00:00:00 |
| `getPreviousWeekStart(weekStart)` | `→ Date` | 上周一 |
| `getNextWeekStart(weekStart)` | `→ Date` | 下周一 |
| `formatDate(d)` | `→ string` | `YYYY-MM-DD` |
| `formatDateTime(d)` | `→ string` | `YYYY-MM-DD HH:mm` |
| `getWeekRangeText(weekStart)` | `→ string` | `YYYY-MM-DD ~ YYYY-MM-DD` |
| `getMonthRangeText(date)` | `→ string` | `YYYY-MM-01 ~ 月末` |
| `getRoleText(role)` | `→ string` | 角色中文映射 |

---

## 7. 核心算法说明

### 7.1 福利计算（welfare.ts）

```
基础福利 baseWelfare = (sgEnabled ? sg × sgRatio : 0) + (qmEnabled ? qm × qmRatio : 0)

排名奖励 rankReward：
  rankEnabled = false          → 0
  rank = 1                     → rank1Reward
  rank = 2                     → rank2Reward
  rank = 3                     → rank3Reward
  rank ≥ 4 且 maixuEnabled
    且 mx ≥ maixuThreshold     → maixuReward
  否则                         → 0

总福利 totalWelfare = baseWelfare + rankReward

麦序最低标准门控（maixuMinEnabled && mx < maixuMinStandard）：
  → baseWelfare 与 rankReward 均置 0（一票否决）
```

### 7.2 排名算法 computeRanking

`computeRanking(refDate, branchFilter?, cycle=WEEK): Promise<RankingItem[]>`

1. **确定查询范围**：MONTH 用 `[periodStart, periodEnd)` 范围查；WEEK 用 `weekStart = periodStart` 精确匹配。
2. **查 dataRecord**（含 personnel、branch 关联），空则返回 `[]`。
3. **查相关厅 rewardRule**，构建 `branchId → rule` Map（无规则用 `DEFAULT_RULE`）。
4. **按 `(branchId, personnelId)` 二级 Map 聚合**：月模式求和（多条周记录），周模式天然单条但走相同逻辑兼容。
5. **对每个厅**：
   - 按 `mx 降序` 排序，相同 mx 按 `personnelId 升序`（稳定排序）。
   - 逐人员计算 rank（从 1 起）。
   - 麦序最低标准门控：`maixuMinEnabled && mx < maixuMinStandard` → baseWelfare 与 rankReward 均置 0。
   - 否则计算 baseWelfare 与 rankReward，`totalWelfare = baseWelfare + rankReward`。
6. **厅按 branchId 升序处理**，结果扁平化为数组返回。

**关键设计**：排名按厅分组独立计算（每厅各有自己的 1/2/3 名）；月模式通过聚合多条周记录实现"周录入月汇总"；全部厅查询时强制 WEEK 周期以保证一致性。

### 7.3 周起止计算 getWeekStart

```
day = date.getDay()           // 0=周日, 1=周一, ..., 6=周六
diff = day === 0 ? -6 : 1 - day  // 周日回退到上周一，其他推算到本周一
date.setDate(date.getDate() + diff)
将时分秒归零 → 返回周一 00:00:00
```

---

## 8. 认证与权限模型

### 8.1 角色层级

| 角色 | 标识 | 等级 | 权限 |
|------|------|------|------|
| 会长 | HUIZHANG | 3 | 最高权限，全厅可管，可建会长，可删数据 |
| 超管 | CHAOGUAN | 2 | 本厅可管，可建本厅 GUANLI，可删数据 |
| 管理 | GUANLI | 1 | 本厅只读 + 录入，不可删数据 |

上级自动继承下级权限（`requireRole` 基于 `ROLE_LEVEL` 比较）。

### 8.2 认证流程

1. 登录 `POST /api/auth/login` → bcrypt 比对 → 签发 JWT（7 天过期）。
2. 前端存 `localStorage['token']`，请求拦截器注入 `Authorization: Bearer <token>`。
3. 后端 `authenticate` 中间件 `verifyToken` 解码，挂载 `request.user`。
4. 响应拦截器遇 401 清 token 跳登录。

### 8.3 分部隔离

各路由内部通过辅助函数实现（非统一中间件）：

- `resolveBranchId`（data-records.ts）— 录入操作。
- `resolveQueryBranchId`（welfare.ts）— 查询操作。
- `resolveDashboardBranchId` / `resolveRankingBranchId`（dashboard.ts / ranking.ts）— 看板/排名，**超管/管理忽略 `viewAll` 强制本厅**。

### 8.4 权限约束（硬约束）

- 会长添加会长时 branchId 可为 null。
- 会长可设置任意角色（含会长），超管只能设置管理。
- 会长可操作其他会长账户（仍不能操作自己）。
- 录入历史记录仅会长和超管可见。
- 超管访问录入历史记录仅限本分部。
- 超管/管理用户初始 branchId 锁定到 user.branchId，默认显示本厅统计数据。
- 超管/管理无法通过 viewAll 参数查看全部厅按月汇总数据（看板和排名接口始终返回本厅数据）。
- 超管可访问厅管理页（canManage = isHuizhang || isChaoguan）。
- 超管只能更新本厅规则（PUT /api/reward-rules/:branchId）。
- 超管厅列表仅显示本厅。

---

## 9. 主题系统

- **机制**：CSS 变量 + Tailwind `darkMode: 'class'`。
- **配置**：`tailwind.config.js` 中所有颜色通过 `rgb(var(--color-xxx) / <alpha-value>)` 引用，实际颜色值在 `index.css` 的 `:root`（明亮）与 `.dark`（暗黑）中以 `--color-xxx: R G B` 定义。
- **切换**：`useTheme` 在 `<html>` 上增删 `dark` 类，支持 light / dark / auto 三态，auto 模式监听 `matchMedia('(prefers-color-scheme: dark)')` 实时响应。
- **主色**：翡翠绿（#059669 / #10B981）；强调色：琥珀（#D97706 / #F59E0B）。
- **字体**：sans = `Fira Sans`，mono = `Fira Code`（数字与图表用 mono + `tabular-nums`）。
- **动画**：`shimmer`（骨架屏）、`countUp`（数字）。

---

## 10. 项目运行方式

### 10.1 环境要求

- Node.js 18+（推荐 20.x LTS）
- npm 9+

### 10.2 安装依赖

```bash
# 根目录统一安装（含 server 与 client）
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 10.3 配置数据库

后端使用 SQLite，数据库文件为 `server/dev.db`，无需额外安装数据库服务。

环境变量 `server/.env`：

```env
DATABASE_URL="file:./dev.db"
```

### 10.4 运行数据库迁移

```bash
cd server
npx prisma generate      # 生成 Prisma Client
npx prisma migrate dev   # 创建数据库并应用迁移
```

### 10.5 初始化会长账户

启动后端后调用种子接口：

```bash
curl -X POST http://localhost:3001/api/seed
```

默认会长账户：`admin` / `admin123`（首次部署后请及时修改）。

### 10.6 启动开发服务

**一键启动前后端（推荐，根目录执行）**：

```bash
npm run dev      # concurrently 同时启动 server(3001) 与 client(5173)
```

**分别启动**：

```bash
cd server && npm run dev   # 后端 tsx watch，端口 3001
cd client && npm run dev   # 前端 vite，端口 5173
```

### 10.7 访问地址

- 前端页面：http://localhost:5173
- 后端 API：http://localhost:3001
- 健康检查：http://localhost:3001/health

### 10.8 根目录脚本一览

| 脚本 | 作用 |
|------|------|
| `npm run dev` | concurrently 同时启动前后端 |
| `npm run dev:server` | 仅启动后端 |
| `npm run dev:client` | 仅启动前端 |
| `npm run build` | 构建前后端（server tsc + client vite build） |
| `npm test` | 运行后端测试 |

---

## 11. 测试与部署

### 11.1 测试

后端单元测试使用 Vitest：

```bash
cd server
npm test
```

- 测试文件：`server/tests/auth.test.ts`（认证接口）、`server/tests/welfare.test.ts`（福利计算）。
- 使用独立 `test.db`，不影响开发数据。
- 配置：`vitest.config.ts` + `tests/globalSetup.ts` + `tests/setup.ts`。

### 11.2 构建

```bash
cd server && npm run build    # tsc，产物 dist/
cd client && npm run build    # tsc -b && vite build，产物 dist/
```

### 11.3 生产部署要点

1. **后端**：`npm run build` 后用 PM2 管理 `dist/src/index.js`，监听 3001。
2. **前端**：`npm run build` 产物 `client/dist/`，由 Nginx 托管静态资源。
3. **Nginx 反向代理**：`/` 指向前端 dist，`/api/` 代理后端 3001，`client_max_body_size 10m`（Excel 导入）。
4. **数据库迁移**：`npx prisma migrate deploy`。
5. **CORS**：生产环境建议通过 Nginx 同源代理，或修改 `server/src/index.ts` CORS 配置允许生产域名。
6. **JWT 密钥**：修改 `server/src/utils/jwt.ts` 与 `server/src/index.ts` 中的 `JWT_SECRET`。
7. **HTTPS**：推荐 Let's Encrypt + Certbot 自动续期。

### 11.4 数据库备份

- **自动备份**：后端启动时注册 `node-cron`，每天 03:00 执行 `runBackup()`。
- **备份目录**：`server/backups/`，文件名 `backup-YYYY-MM-DD-HH-mm-ss.db`。
- **保留策略**：自动清理超过 30 天的旧备份。
- **手动备份**：`npx tsx scripts/backup.ts`。
- **数据恢复**：停止后端 → 用备份文件替换 `dev.db` → 重启。

详细部署流程见 [deployment-guide.md](./deployment-guide.md)。

---

## 12. 已知设计要点与注意事项

1. **权限模型统一**：写操作通过 `preHandler: [authenticate, requireRole(...)]` 链式守卫；分部隔离由各路由内部 `resolveBranchId` 等辅助函数实现，未使用 `middleware/branch.ts`（该中间件冗余）。

2. **三套并存的分部解析函数**：`resolveBranchId`（data-records.ts，返回 result 对象）、`resolveQueryBranchId`（welfare.ts，返回 number|undefined）、`resolveDashboardBranchId`/`resolveRankingBranchId`（dashboard.ts/ranking.ts，超管/管理忽略 viewAll 强制本厅）——语义相近但有细微差异，存在一定重复。

3. **两套 calcWelfare 实现**：data-query.ts 内的简化版（含 maixuBonus，不含排名奖励）用于单条记录展示；welfare.ts 的正式版（computeBaseWelfare + computeRankReward 分离）用于周期排名聚合。

4. **周/月双周期**：通过 `branch.statCycle` 配置 + 前端 cycle 参数 + `resolveCycle` 兜底，实现"周录入、月汇总"的灵活模式；全部厅查询时强制按周以保证一致性。

5. **历史审计**：data-records.ts 的 PUT/DELETE 在事务中同步写入 DataHistory；data-history.ts 提供统一视图合并 DataRecord.createdAt 与 DataHistory.modifyTime。

6. **人员多分部**：personnel 与 branch 为多对多（通过 PersonnelBranch 关联表），同名人员全局唯一，可同时属于多个分部；删除时若仅属于一个分部则连同人员记录删除。

7. **前端 baseURL 硬编码**：`client/src/api/index.ts` 中 `baseURL: 'http://localhost:3001/api'` 硬编码，vite.config.ts 未配 proxy，生产部署需调整为相对路径或环境变量。

8. **路由层权限**：角色级权限不在路由层做，仅页面内部 `isHuizhang/isChaoguan` 判断显示「无权访问」，URL 误输入会先看到无权提示而非重定向。

9. **weekStart 重复定义**：`personnel.ts` 内部重复定义了 `getWeekStart`，未复用 `utils/week.ts`。

10. **Layout 持久化**：App.tsx 使用嵌套路由 + `<Outlet />`，Layout 只挂载一次，避免路由切换时 `sidebarCollapsed` 状态丢失。

---

## 附：相关文档

- [数据库设计文档](./database-design.md)
- [部署指南](./deployment-guide.md)
- [用户操作手册](./user-manual.md)
