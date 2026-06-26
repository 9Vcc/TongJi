# 系统部署指南

## 1. 环境要求

| 软件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Node.js | 18.0+ | 20.x LTS | 后端运行环境 |
| npm | 9.0+ | 10.x | 包管理工具 |
| MariaDB | 10.5+ | 11.x | 数据库（Docker 部署已内置） |
| Nginx | 1.18+ | 1.24+ | 反向代理与静态资源服务（生产，手动部署） |
| PM2 | 5.0+ | 5.3+ | Node 进程守护（生产，手动部署） |
| Docker | 24.0+ | 最新 | 容器部署（推荐，见第 3 节） |
| 操作系统 | — | Linux（Arch Linux / 通用发行版） | 推荐生产部署 |

### 技术栈

- **后端**：Fastify 5.x + Prisma 7.x + MariaDB (@prisma/adapter-mariadb)
- **前端**：React 19 + Vite 8 + TailwindCSS 3
- **数据库**：MariaDB 11.x（支持 Docker 部署）
- **定时任务**：node-cron（数据库自动备份，mysqldump）

### 生产架构

```
公网用户 ──→ Nginx (80/443) ──┬─→ 静态文件 client/dist (前端)
                              └─→ 反向代理 /api → 127.0.0.1:3001 (后端 Node)
                                                       │
                                                       └─→ MariaDB (3306)
PM2 守护: server (node dist/src/index.js)
```

---

## 2. 本地开发部署

### 2.1 克隆项目

```bash
git clone <项目仓库地址>
cd tongji
```

### 2.2 安装依赖

项目根目录已配置 workspace 脚本，可一键启动前后端，但依赖需分别安装：

```bash
# 后端依赖
cd server
npm install

# 前端依赖
cd ../client
npm install
```

### 2.3 配置数据库（MariaDB）

项目使用 MariaDB 作为数据库。本地开发推荐使用 Docker 启动 MariaDB：

```bash
# 在项目根目录启动 MariaDB（仅数据库，不启动应用）
docker compose -f docker-compose.dev.yml up -d
```

启动后，MariaDB 连接信息：
- 主机：`127.0.0.1`
- 端口：`3306`
- 数据库：`tongji`
- 用户名：`tongji` / 密码：`tongji123`
- root密码：`root123`（用于测试创建/删除测试库）

环境变量配置文件 `server/.env`：

```env
DATABASE_URL="mariadb://tongji:tongji123@127.0.0.1:3306/tongji"
JWT_SECRET="dev-secret-change-me-in-production-2026"
```

> 也可复制 `server/.env.example` 为 `server/.env` 并按需修改。

### 2.4 运行数据库迁移

```bash
cd server

# 生成 Prisma Client
npx prisma generate

# 应用迁移到 MariaDB
npx prisma migrate deploy
```

### 2.5 启动开发服务

**方式一：一键启动前后端（推荐）**

在项目根目录执行：

```bash
npm run dev
```

此命令使用 `concurrently` 同时启动前后端开发服务器。

**方式二：分别启动**

```bash
# 终端1 - 启动后端（端口 3001，监听 IPv4/IPv6 双栈）
cd server
npm run dev

# 终端2 - 启动前端（端口 5173，监听 0.0.0.0）
cd client
npm run dev
```

### 2.6 初始化会长账户

首次部署需要创建默认会长账户。启动后端服务后，调用种子接口：

```bash
# 在另一个终端执行（创建会长账户）
curl -X POST http://localhost:3001/api/seed
```

默认会长账户：
- 用户名：`admin`
- 密码：`admin123`

> 首次登录后请立即在「系统设置 → 账户管理」修改密码。

### 2.7 访问系统

- 前端页面：http://localhost:5173
- 后端 API：http://localhost:3001
- 健康检查：http://localhost:3001/health

### 2.8 内网穿透/公网访问（开发环境）

项目已配置好支持内网穿透访问，无需额外修改代码。

**Vite 配置**（[client/vite.config.ts](file:///e:/1Xiangmu/tongji/client/vite.config.ts)）：

- `server.host: true` — 监听所有网卡（IPv4 + IPv6）
- `server.allowedHosts: ['ldr.9vcc.top']` — 允许的穿透域名（按需添加）
- `server.proxy['/api']` — 将 `/api` 代理到 `http://127.0.0.1:3001`

**后端配置**（[server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts)）：

- `host: '::'` — 监听 IPv6 双栈（同时接受 IPv4 与 IPv6 连接）
- `cors.origin: true` — 允许所有来源（任意域名/IP/端口）

**前端 API 配置**（[client/src/api/index.ts](file:///e:/1Xiangmu/tongji/client/src/api/index.ts)）：

- `baseURL: '/api'` — 相对路径，由 Vite proxy 转发，避免硬编码 localhost

使用 Lucky / frp / ngrok 等内网穿透工具时，只需将隧道目标设为 `127.0.0.1:5173`，并在 `vite.config.ts` 的 `allowedHosts` 中添加穿透域名即可。

---

## 3. Docker 部署（推荐）

### 3.1 前置要求

| 软件 | 最低版本 | 说明 |
|------|----------|------|
| Docker | 24.0+ | 容器引擎 |
| Docker Compose | 2.20+ | 容器编排（已内置在 Docker 中） |

```bash
# Arch Linux 安装 Docker
sudo pacman -S --needed docker docker-compose

# 启动 Docker 并设置开机自启
sudo systemctl enable --now docker

# 验证
docker --version
docker compose version
```

### 3.2 配置环境变量

在项目根目录复制环境变量模板并修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件，**务必修改 JWT_SECRET**：

```env
# MariaDB 配置
MARIADB_ROOT_PASSWORD=root123
MARIADB_DATABASE=tongji
MARIADB_USER=tongji
MARIADB_PASSWORD=tongji123

# 应用配置
APP_PORT=80
JWT_SECRET=your-strong-random-secret-here
JWT_EXPIRES_IN=7d
```

> 生成强随机密钥：`openssl rand -base64 48`

### 3.3 构建并启动

```bash
# 构建镜像并启动所有服务（首次构建约 3-5 分钟）
docker compose up -d --build

# 查看启动日志
docker compose logs -f app

# 看到以下输出表示启动成功：
#   [1/4] 等待 MariaDB 就绪...
#   [2/4] 执行数据库迁移...
#   [3/4] 启动 Nginx + Node.js...
#   [4/4] 初始化会长账户...
#   服务已启动
```

### 3.4 验证部署

```bash
# 检查容器状态
docker compose ps

# 测试访问
curl http://localhost/health
# 返回 {"status":"ok","timestamp":"..."}

# 浏览器访问
# http://localhost  （前端页面）
```

默认会长账户：
- 用户名：`admin`
- 密码：`admin123`

> 首次登录后请立即修改密码。

### 3.5 架构说明

```
                    ┌─────────────────────────────────┐
公网用户 ──→ :80 ──→│  tongji-app 容器                │
                    │  ┌──────────────────────────┐   │
                    │  │ Nginx (:80)              │   │
                    │  │  ├─ / → 前端静态文件      │   │
                    │  │  └─ /api → :3001 代理     │   │
                    │  └──────────────────────────┘   │
                    │  ┌──────────────────────────┐   │
                    │  │ Node.js (:3001)          │   │
                    │  │  └─ Fastify 后端 API     │   │
                    │  └──────────────────────────┘   │
                    └──────────┬──────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │  tongji-mariadb 容器             │
                    │  MariaDB 11 (:3306)              │
                    │  数据卷: mariadb-data            │
                    └─────────────────────────────────┘
```

Docker 架构特点：
- **单容器**：Nginx + Node.js 运行在同一容器，由 `entrypoint.sh` 管理
- **数据持久化**：MariaDB 数据通过 Docker Volume 持久化，备份文件通过 Volume 挂载
- **自动迁移**：容器启动时自动执行 `prisma migrate deploy`
- **自动初始化**：启动后自动调用 `/api/seed` 创建会长账户（如不存在）
- **健康检查**：MariaDB 容器配置了 healthcheck，应用容器等待数据库就绪后启动

### 3.6 常用运维命令

```bash
# 查看日志
docker compose logs -f app          # 应用日志
docker compose logs -f mariadb      # 数据库日志

# 重启服务
docker compose restart app          # 仅重启应用
docker compose restart              # 重启所有服务

# 停止/启动
docker compose down                 # 停止并删除容器（保留数据）
docker compose down -v              # 停止并删除容器和数据卷（谨慎！）
docker compose up -d                # 重新启动

# 进入容器
docker compose exec app sh          # 进入应用容器
docker compose exec mariadb mariadb -u tongji -p  # 进入 MariaDB

# 查看数据库备份
docker compose exec app ls -la /app/backups/
```

### 3.7 更新部署

```bash
# 拉取最新代码后重新构建
git pull
docker compose up -d --build

# 仅重启（代码无变化时）
docker compose restart app
```

### 3.8 数据备份与恢复

```bash
# 手动备份数据库
docker compose exec app sh -c 'cd /app && npx tsx scripts/backup.ts'
# 或直接用 mysqldump
docker compose exec mariadb mysqldump -u tongji -ptongji123 tongji > backup.sql

# 恢复数据库
docker compose exec -T mariadb mariadb -u tongji -ptongji123 tongji < backup.sql

# 备份数据卷
docker run --rm -v tongji_mariadb-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/mariadb-data-$(date +%Y%m%d).tar.gz /data
```

### 3.9 自定义端口

修改 `.env` 文件中的 `APP_PORT`：

```env
# 使用 8080 端口
APP_PORT=8080
```

```bash
docker compose up -d
```

---

## 4. Linux 服务器生产部署（手动）

### 4.1 环境准备

Arch Linux 使用 pacman 作为包管理器：

```bash
# 更新系统
sudo pacman -Syu

# 安装 Node.js + npm（Arch 官方仓库已包含较新版本）
sudo pacman -S --needed nodejs npm

# 验证
node -v   # v20.x.x 或更高
npm -v    # 10.x.x 或更高

# 安装 PM2 进程守护
sudo npm install -g pm2

# 安装 Nginx + git + MariaDB
sudo pacman -S --needed nginx git mariadb mariadb-clients

# 启动 MariaDB 并设置开机自启
sudo systemctl enable --now mariadb

# 初始化 MariaDB（设置 root 密码，移除测试数据库）
sudo mysql_secure_installation
```

> **备选**：如需特定 Node 版本，可安装 nvm：
> ```bash
> sudo pacman -S nvm
> echo 'source /usr/share/nvm/init-nvm.sh' >> ~/.bashrc
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

### 4.2 获取代码并安装依赖

```bash
sudo mkdir -p /opt/tongji
sudo chown $USER:$USER /opt/tongji

git clone <项目仓库地址> /opt/tongji
cd /opt/tongji

# 后端依赖
cd server
npm install

# 前端依赖
cd ../client
npm install
```

### 4.3 配置后端环境

```bash
# 创建数据库和用户
sudo mariadb << 'EOF'
CREATE DATABASE tongji CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tongji'@'localhost' IDENTIFIED BY 'tongji123';
GRANT ALL PRIVILEGES ON tongji.* TO 'tongji'@'localhost';
FLUSH PRIVILEGES;
EOF

cd /opt/tongji/server

# 配置环境变量
cp .env.example .env
# 编辑 .env，设置 DATABASE_URL 和 JWT_SECRET
nano .env
```

`.env` 配置内容：

```env
DATABASE_URL="mariadb://tongji:tongji123@127.0.0.1:3306/tongji"
JWT_SECRET="your-strong-random-secret"
JWT_EXPIRES_IN="7d"
NODE_ENV="production"
```

```bash
# 生成 Prisma Client
npx prisma generate

# 应用数据库迁移（生产环境用 deploy，不会重置数据）
npx prisma migrate deploy
```

### 4.4 构建后端

```bash
cd /opt/tongji/server
npm run build
# 构建产物位于 server/dist/ 目录
```

### 4.5 构建前端

```bash
cd /opt/tongji/client
npm run build
# 构建产物位于 client/dist/ 目录
```

### 4.6 初始化会长账户

首次部署需要创建默认会长账户：

```bash
cd /opt/tongji/server

# 临时启动后端
node dist/src/index.js &
# 等待输出 "Server is running" 后执行

# 创建会长账户
curl -X POST http://localhost:3001/api/seed

# 停止临时进程
kill %1
```

默认账户 `admin / admin123`，首次登录后请立即修改密码。

### 4.7 使用 PM2 管理后端进程

```bash
cd /opt/tongji/server

# 启动后端服务
pm2 start dist/src/index.js --name tongji-server

# 保存进程列表
pm2 save

# 设置开机自启（按提示执行返回的命令）
pm2 startup
```

常用命令：

```bash
pm2 status                # 查看状态
pm2 logs tongji-server    # 查看日志
pm2 restart tongji-server # 重启
pm2 stop tongji-server    # 停止
pm2 delete tongji-server  # 删除
```

### 4.8 配置 Nginx 反向代理

```bash
sudo vim /etc/nginx/sites-available/tongji.conf
```

配置内容（将 `your-domain.com` 换成你的域名或 IP）：

```nginx
server {
    listen 80;
    # 若需支持 IPv6 公网访问，取消下一行注释
    # listen [::]:80;
    server_name your-domain.com;

    # 前端静态资源
    root /opt/tongji/client/dist;
    index index.html;

    # SPA 路由回退（所有非文件请求都返回 index.html）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 文件上传大小限制（Excel 导入，后端限制 10MB）
    client_max_body_size 10m;

    # 静态资源长缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用站点并重载：

```bash
# 创建符号链接启用站点
sudo ln -s /etc/nginx/sites-available/tongji.conf /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 启动 Nginx 并设置开机自启
sudo systemctl enable --now nginx

# 重载配置
sudo systemctl reload nginx
```

### 4.9 配置 HTTPS（推荐）

使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo pacman -S certbot certbot-nginx

# 自动配置 HTTPS（会自动修改 Nginx 配置并强制跳转）
sudo certbot --nginx -d your-domain.com

# 验证自动续期（Arch 默认已装 systemd timer）
sudo systemctl enable --now certbot-renew.timer
sudo certbot renew --dry-run
```

### 4.10 防火墙配置

Arch Linux 推荐 `firewalld` 或 `ufw`：

```bash
# 方式一：firewalld（推荐）
sudo pacman -S firewalld
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# 方式二：ufw（如习惯 Debian/Ubuntu 工具链）
sudo pacman -S ufw
sudo systemctl enable --now ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 若需 IPv6 公网直连，确保 IPv6 防火墙未阻止入站
# 注意：后端 3001 端口无需对外暴露，仅 Nginx 通过 127.0.0.1 访问
```

---

## 5. 更新部署

代码更新后的标准流程：

```bash
cd /opt/tongji
git pull

# 后端
cd server
npm install              # 如有新依赖
npx prisma generate      # 如 schema 有变更
npx prisma migrate deploy
npm run build
pm2 restart tongji-server

# 前端
cd ../client
npm install
npm run build            # Nginx 直接读 dist，无需重启
```

---

## 6. 数据库备份

### 6.1 自动备份

系统已内置自动备份功能，后端服务启动时会自动注册定时任务：

- **执行时间**：每天凌晨 3:00
- **备份方式**：`mysqldump` 导出 SQL 文件
- **备份目录**：`server/backups/`（Docker 环境为 `/app/backups/`）
- **文件名格式**：`backup-YYYY-MM-DD-HH-mm-ss.sql`
- **保留策略**：自动清理超过 30 天的旧备份

无需额外配置，定时任务在后端启动时自动注册。

> **依赖**：系统需安装 `mysqldump` 命令。Docker 镜像已内置；手动部署需安装 `mariadb-clients`（Arch）或 `default-mysql-client`（Debian）。

### 6.2 手动备份

```bash
# 手动部署环境
cd /opt/tongji/server
npx tsx scripts/backup.ts

# 或直接使用 mysqldump
mysqldump -u tongji -p tongji > backup-$(date +%Y%m%d).sql
```

### 6.3 数据恢复

```bash
# 恢复 SQL 备份到 MariaDB
mariadb -u tongji -p tongji < /opt/tongji/server/backups/backup-YYYY-MM-DD-HH-mm-ss.sql

# 或在 Docker 环境中
docker compose exec -T mariadb mariadb -u tongji -ptongji123 tongji < backup.sql
```

### 6.4 异地备份（推荐）

将备份目录定期同步到异地或对象存储：

```bash
# 示例：每天凌晨 4 点 rsync 到另一台服务器
echo "0 4 * * * rsync -az /opt/tongji/server/backups/ user@backup-server:/backup/tongji/" | crontab -
```

---

## 7. 运行测试

### 7.1 后端单元测试

```bash
cd server
npm test
```

测试使用 Vitest 框架，使用独立的 MariaDB 测试数据库 `tongji_test`，不影响开发/生产数据。

> 前置条件：本地 MariaDB 服务已启动（`docker compose -f docker-compose.dev.yml up -d`）。

### 7.2 前端构建检查

```bash
cd client
npm run build
```

---

## 8. 关键配置说明

| 配置项 | 位置 | 说明 |
|--------|------|------|
| 数据库连接 | `server/.env` 的 `DATABASE_URL` | MariaDB 连接串 `mariadb://user:pass@host:3306/db` |
| 后端监听 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `host: '::'` | IPv4/IPv6 双栈监听 |
| 后端端口 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `port: 3001` | 仅需对 Nginx 暴露，无需公网开放 |
| CORS | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `origin: true` | 允许所有来源，生产由 Nginx 同源代理兜底 |
| JWT 密钥 | `server/.env` 的 `JWT_SECRET` | 生产环境务必修改为复杂值，至少 32 字节 |
| JWT 有效期 | `server/.env` 的 `JWT_EXPIRES_IN` | 默认 7 天 |
| 前端 API 路径 | [client/src/api/index.ts](file:///e:/1Xiangmu/tongji/client/src/api/index.ts) `baseURL: '/api'` | 相对路径，由 Nginx/Vite proxy 转发 |
| 文件上传限制 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `limits.fileSize` | 默认 10MB |

---

## 9. 常见问题

### Q1: 启动后端报错 "Can't reach database server"？

MariaDB 服务未启动或连接信息错误：

```bash
# 检查 MariaDB 服务状态
sudo systemctl status mariadb

# 启动 MariaDB
sudo systemctl start mariadb

# 验证连接
mariadb -u tongji -p -h 127.0.0.1 tongji

# 检查 server/.env 中 DATABASE_URL 是否正确
```

Docker 环境：`docker compose ps` 检查 MariaDB 容器是否健康。

### Q2: Prisma 迁移报错 "Migration failed"？

可能是数据库状态不一致。备份后重置：

```bash
# 手动部署环境
cd /opt/tongji/server
pm2 stop tongji-server

# 备份后重新创建数据库
mysqldump -u tongji -p tongji > backup.sql
sudo mariadb -e "DROP DATABASE tongji; CREATE DATABASE tongji CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

npx prisma migrate deploy
pm2 start tongji-server
curl -X POST http://localhost:3001/api/seed
```

Docker 环境：`docker compose down -v && docker compose up -d --build`（会删除数据，谨慎操作）。

### Q3: 前端页面空白 / API 报 404？

检查 Nginx 配置：

1. `location /api/` 的 `proxy_pass` 末尾**不要加斜杠**（`http://127.0.0.1:3001` 而非 `http://127.0.0.1:3001/`），否则路径会被截断
2. `location /` 的 `try_files` 必须包含 `/index.html`，否则 SPA 路由刷新 404
3. 确认后端已启动：`pm2 status`、`curl http://127.0.0.1:3001/health`

### Q4: 如何修改 JWT 密钥？

修改 `server/.env` 文件中的 `JWT_SECRET` 值，重启后端即可。修改后所有已登录用户的 token 将失效，需重新登录。

```bash
# 生成强随机密钥
openssl rand -base64 48

# 编辑 .env，修改 JWT_SECRET 后重启
pm2 restart tongji-server
```

### Q5: 如何修改后端端口？

修改 [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) 中 `fastify.listen({ port: 3001 })` 的端口号，同步更新：

- Nginx 配置中 `proxy_pass http://127.0.0.1:新端口`
- 开发环境还需更新 [client/vite.config.ts](file:///e:/1Xiangmu/tongji/client/vite.config.ts) 中 `proxy['/api'].target`

### Q6: 数据库越来越大怎么办？

MariaDB 删除数据后可通过 OPTIMIZE TABLE 回收空间：

```bash
# 手动优化所有表
mariadb -u tongji -p tongji -e "OPTIMIZE TABLE Account, Branch, Personnel, PersonnelBranch, DataRecord, DataHistory, RewardRule, Notification;"

# 或在 Docker 中
docker compose exec mariadb mariadb -u tongji -ptongji123 tongji \
  -e "OPTIMIZE TABLE Account, Branch, Personnel, PersonnelBranch, DataRecord, DataHistory, RewardRule, Notification;"
```

### Q7: 如何查看数据库内容？

使用 Prisma Studio 可视化工具：

```bash
cd /opt/tongji/server
npx prisma studio
```

浏览器访问 http://localhost:5555 即可查看和编辑数据。生产环境建议仅在本机或 SSH 隧道中访问。

### Q8: IPv6 公网无法访问？

1. 确认服务器有公网 IPv6 地址：`ip -6 addr show`
2. 放行防火墙：`sudo ip6tables -A INPUT -p tcp --dport 80 -j ACCEPT`（或用 ufw）
3. Nginx 配置中取消 `listen [::]:80;` 注释
4. 检查云服务商安全组是否放行 IPv6 入站
5. 部分家用宽带的 80/443 端口被运营商封锁，需改用非标准端口（如 5678）

### Q9: PM2 日志在哪里？

```bash
pm2 logs tongji-server --lines 100   # 查看最近 100 行
# 日志文件默认位于 ~/.pm2/logs/
```
