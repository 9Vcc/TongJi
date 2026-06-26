# 系统部署指南

## 1. 环境要求

| 软件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Node.js | 18.0+ | 20.x LTS | 后端运行环境（手动部署） |
| npm | 9.0+ | 10.x | 包管理工具（手动部署） |
| MariaDB | 10.5+ | 11.x | 数据库（需独立搭建，Docker 编排不包含） |
| Nginx | 1.18+ | 1.24+ | 反向代理与静态资源服务（手动部署） |
| PM2 | 5.0+ | 5.3+ | Node 进程守护（手动部署） |
| Docker | 24.0+ | 最新 | 容器部署（推荐，见第 3 节） |
| Docker Compose | 2.20+ | 最新 | 容器编排（已内置在 Docker 中） |
| 操作系统 | Ubuntu 22.04+ | Ubuntu 24.04 LTS | 推荐生产部署 |

### 技术栈

- **后端**：Fastify 5.x + Prisma 7.x + MariaDB (@prisma/adapter-mariadb)
- **前端**：React 19 + Vite 8 + TailwindCSS 3
- **数据库**：MariaDB 11.x（需独立搭建，Docker 编排不包含）
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
DATABASE_URL="mysql://tongji:tongji123@127.0.0.1:3306/tongji"

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

Docker 部署是最简单的方式：一条命令启动前端、后端、Nginx 全部服务，无需手动安装 Node.js、Nginx、PM2 等依赖。

> **数据库前提**：本编排**不包含** MariaDB，请先在宿主机或远程搭建好 MariaDB 11.x 实例，并创建数据库和用户（见 3.3 前置准备）。

### 3.1 Ubuntu 安装 Docker

Ubuntu 24.04 LTS 推荐使用 Docker 官方源安装最新版：

```bash
# 1. 更新 apt 索引并安装必要依赖
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release

# 2. 添加 Docker 官方 GPG 密钥
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. 添加 Docker apt 源
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. 安装 Docker Engine + Compose 插件
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. 启动 Docker 并设置开机自启
sudo systemctl enable --now docker

# 6. 将当前用户加入 docker 组（免 sudo 调用 docker，需重新登录生效）
sudo usermod -aG docker $USER
newgrp docker

# 7. 验证
docker --version              # Docker version 27.x 或更高
docker compose version        # Docker Compose version v2.x
docker run hello-world        # 测试运行
```

> **国内服务器加速**：如拉取镜像慢，可配置镜像加速器：
> ```bash
> sudo mkdir -p /etc/docker
> sudo tee /etc/docker/daemon.json << 'EOF'
> {
>   "registry-mirrors": [
>     "https://docker.m.daocloud.io",
>     "https://dockerproxy.com"
>   ]
> }
> EOF
> sudo systemctl daemon-reload
> sudo systemctl restart docker
> ```

### 3.2 项目目录与权限

```bash
# 创建部署目录
sudo mkdir -p /opt/tongji
sudo chown $USER:$USER /opt/tongji

# 克隆项目
git clone <项目仓库地址> /opt/tongji
cd /opt/tongji
```

### 3.3 配置环境变量

本项目 Docker 部署**仅启动应用容器**（前端 + 后端 + Nginx），数据库（MariaDB）请使用已独立搭建的实例。

在项目根目录复制环境变量模板并修改：

```bash
cp .env.example .env
nano .env
```

编辑 `.env` 文件，**务必修改 DATABASE_URL 和 JWT_SECRET**：

```env
# ---------- MariaDB 数据库连接 ----------
# 完整连接串，格式：mysql://用户名:密码@主机:端口/数据库名
# 注意：必须使用 mysql:// 协议（Prisma CLI 不识别 mariadb://，MariaDB 兼容 MySQL 协议）
# 主机地址根据 MariaDB 位置选择：
#   - 同宿主机：host.docker.internal（推荐）
#   - 远程服务器：填写 IP，如 192.168.1.100
DATABASE_URL=mysql://tongji:tongji123@host.docker.internal:3306/tongji

# ---------- 应用配置 ----------
APP_PORT=80
JWT_SECRET=your-strong-random-secret-here
JWT_EXPIRES_IN=7d
```

**前置准备**（在已搭建的 MariaDB 中创建数据库和用户）：

```sql
-- 登录 MariaDB 后执行
CREATE DATABASE tongji CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tongji'@'%' IDENTIFIED BY 'tongji123';
GRANT ALL PRIVILEGES ON tongji.* TO 'tongji'@'%';
FLUSH PRIVILEGES;
```

> **重要**：
> - 用户授权主机必须包含 `%` 或 Docker 网段（如 `172.18.0.%`），不能仅 `localhost`
> - MariaDB 的 `bind-address` 建议改为 `0.0.0.0` 以接受 Docker 容器连接
> - 生成 JWT 密钥：`openssl rand -base64 48`

### 3.4 构建并启动

```bash
# 构建镜像并启动所有服务（首次构建约 3-5 分钟）
docker compose up -d --build

# 查看启动日志（实时跟踪）
docker compose logs -f app

# 看到以下输出表示启动成功：
#   [1/4] 等待 MariaDB 就绪...
#   [2/4] 执行数据库迁移...
#   [3/4] 启动 Nginx + Node.js...
#   [4/4] 初始化会长账户...
#   服务已启动
```

### 3.5 验证部署

```bash
# 检查容器状态（app 容器应为 Up）
docker compose ps

# 测试健康检查
curl http://localhost/health
# 返回 {"status":"ok","timestamp":"..."}

# 测试前端页面
curl -I http://localhost
# 返回 HTTP/1.1 200 OK
```

浏览器访问 `http://服务器IP`，使用默认账户登录：
- 用户名：`admin`
- 密码：`admin123`

> 首次登录后请立即修改密码。

### 3.6 架构说明

```
                    ┌─────────────────────────────────┐
公网用户 ──→ :80 ──→│  tongji-app 容器                │
                    │  ┌──────────────────────────┐   │
                    │  │ Nginx (:80)              │   │
                    │  │  ├─ / → 前端静态文件      │   │
                    │  │  ├─ /api → :3001 代理     │   │
                    │  │  └─ /health → :3001 代理  │   │
                    │  └──────────────────────────┘   │
                    │  ┌──────────────────────────┐   │
                    │  │ Node.js (:3001)          │   │
                    │  │  └─ Fastify 后端 API     │   │
                    │  └────────────┬─────────────┘   │
                    └───────────────┼──────────────────┘
                                    │ host.docker.internal
                    ┌───────────────▼──────────────────┐
                    │  外部 MariaDB 实例（独立搭建）   │
                    │  MariaDB 11 (:3306)              │
                    │  数据库：tongji                  │
                    │  用户需授权 '%' 或 Docker 网段   │
                    └─────────────────────────────────┘
```

Docker 架构特点：
- **仅应用容器**：编排内仅含 `tongji-app` 一个容器（Nginx + Node.js），数据库使用外部已搭建的 MariaDB 实例
- **多阶段构建**：前端构建 → 后端构建 → 运行时镜像，最终镜像体积小
- **单容器应用**：Nginx + Node.js 运行在同一容器，由 `entrypoint.sh` 管理进程
- **外部数据库**：通过 `DATABASE_URL` 环境变量连接外部 MariaDB，使用 `host.docker.internal` 访问同宿主机数据库
- **数据持久化**：数据库备份文件通过 Volume 持久化到 `app-backups`
- **自动迁移**：容器启动时自动执行 `prisma migrate deploy`
- **自动初始化**：启动后自动调用 `/api/seed` 创建会长账户（如不存在）
- **健康检查**：启动脚本内置轮询等待外部 MariaDB 就绪后再执行迁移
- **优雅退出**：捕获 SIGTERM/SIGINT 信号，先停 Nginx 再停 Node.js

### 3.7 文件结构说明

部署相关文件结构：

```
tongji/
├── Dockerfile                 # 多阶段构建（前端+后端+运行时）
├── docker-compose.yml          # 生产编排（仅 app）
├── docker-compose.dev.yml      # 开发用（仅 mariadb）
├── .env.example                # 环境变量模板
├── .dockerignore               # Docker 构建忽略文件
└── docker/
    ├── nginx.conf              # 容器内 Nginx 配置
    └── entrypoint.sh           # 容器启动脚本
```

### 3.8 常用运维命令

```bash
# ---------- 查看状态与日志 ----------
docker compose ps                    # 查看容器状态
docker compose logs -f app           # 实时查看应用日志
docker compose logs --tail=100 app   # 查看最近 100 行应用日志

# ---------- 重启服务 ----------
docker compose restart app           # 重启应用容器
docker compose restart               # 重启所有容器

# ---------- 停止/启动 ----------
docker compose down                   # 停止并删除容器（保留数据卷）
docker compose down -v                # 停止并删除容器和数据卷（谨慎！备份会丢失）
docker compose up -d                  # 重新启动（不重新构建）
docker compose start                  # 启动已创建的容器（不重建）
docker compose stop                   # 停止容器（不删除）

# ---------- 进入容器调试 ----------
docker compose exec app sh            # 进入应用容器 shell

# ---------- 连接外部 MariaDB ----------
# 方式一：在宿主机直接连接（如已安装 mariadb-client）
mariadb -u tongji -p -h 127.0.0.1 tongji

# 方式二：从容器内连接外部 MariaDB
docker compose exec app sh -c 'node -e "console.log(process.env.DATABASE_URL)"'

# ---------- 查看数据 ----------
docker compose exec app ls -la /app/backups/       # 查看数据库备份文件
docker compose exec app cat /app/dist/src/index.js | head -5  # 查看构建产物
```

### 3.9 更新部署

代码更新后的标准流程：

```bash
cd /opt/tongji

# 1. 拉取最新代码
git pull

# 2. 重新构建并启动（会自动处理迁移）
docker compose up -d --build

# 3. 查看启动日志确认成功
docker compose logs -f app
```

仅修改配置或重启（代码无变化）：

```bash
docker compose restart app
```

### 3.10 数据备份与恢复

**自动备份**：系统内置定时任务，每天凌晨 3:00 自动用 mysqldump 备份到 `/app/backups/`（容器内），保留 30 天。备份文件通过 `app-backups` 数据卷持久化到宿主机。

**手动备份**：

```bash
# 方式一：使用内置备份脚本（从容器内连接外部 MariaDB）
docker compose exec app sh -c 'cd /app && npx tsx scripts/backup.ts'

# 方式二：在宿主机直接用 mysqldump（如已安装 mariadb-client）
mysqldump -u tongji -ptongji123 -h 127.0.0.1 tongji > backup-$(date +%Y%m%d).sql

# 方式三：导出容器内备份目录到宿主机
docker compose cp app:/app/backups ./backups
```

**恢复数据**：

```bash
# 方式一：从宿主机恢复 SQL 到 MariaDB
mariadb -u tongji -ptongji123 -h 127.0.0.1 tongji < backup.sql

# 方式二：将备份文件拷入容器后恢复
docker compose cp backup.sql app:/tmp/
docker compose exec app sh -c 'mariadb -u tongji -ptongji123 -h host.docker.internal tongji < /tmp/backup.sql'
```

**异地备份（推荐）**：

```bash
# 每天凌晨 4 点 rsync 到另一台服务器
echo "0 4 * * * rsync -az /opt/tongji/backups/ user@backup-server:/backup/tongji/" | crontab -

# 或使用 SCP
scp -r /opt/tongji/backups/ user@backup-server:/backup/tongji/
```

### 3.11 自定义端口

修改 `.env` 文件中的 `APP_PORT`：

```env
# 使用 8080 端口（非 root 用户或避免占用 80 时使用）
APP_PORT=8080
```

```bash
docker compose up -d
```

> 如果端口 < 1024（如 80），需要 root 权限或给 docker 服务授予 NET_BIND_SERVICE 能力。

### 3.12 配置 HTTPS（反向代理场景）

如需 HTTPS，推荐在 Docker 前面加一层宿主机 Nginx 反向代理，或使用 Caddy 自动签发证书。

**方式一：宿主机 Nginx + Certbot**

```bash
# 安装 Nginx 和 Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# 配置反向代理到 Docker 应用
sudo nano /etc/nginx/sites-available/tongji
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    # 代理到 Docker 容器（修改 APP_PORT 后同步修改）
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tongji /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 自动签发 HTTPS 证书
sudo certbot --nginx -d your-domain.com
```

**方式二：Caddy 自动 HTTPS**

```bash
# 安装 Caddy
sudo apt install -y caddy

# 编辑配置 /etc/caddy/Caddyfile
echo 'your-domain.com {
    reverse_proxy 127.0.0.1:80
}' | sudo tee /etc/caddy/Caddyfile

sudo systemctl restart caddy
```

### 3.13 防火墙配置

Ubuntu 默认使用 UFW：

```bash
# 启用 UFW
sudo ufw enable

# 放行 SSH（重要！否则会断连）
sudo ufw allow 22/tcp

# 放行 HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 放行 IPv6（如需）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 查看状态
sudo ufw status verbose
```

> 注意：后端 3001 端口**无需对外暴露**，仅容器内部 Nginx 代理访问。MariaDB 3306 端口的访问控制由外部数据库实例自行配置，不在此编排范围内。如 MariaDB 在同宿主机，确保防火墙允许 Docker 网段访问 3306。

### 3.14 清理与卸载

```bash
# 停止并删除容器（保留备份数据卷）
docker compose down

# 停止并删除容器和备份数据卷（彻底清除，谨慎！备份文件会丢失）
docker compose down -v

# 清理未使用的 Docker 镜像
docker image prune -a

# 清理所有未使用资源
docker system prune -a
```

> 数据库（MariaDB）为外部独立实例，不在此编排范围内。如需彻底卸载数据库，请按 MariaDB 自身的卸载流程操作。

---

## 4. 1Panel 面板部署（推荐）

[1Panel](https://1panel.cn) 是现代化开源 Linux 服务器运维管理面板，内置 Docker 管理、Compose 编排、网站反向代理、SSL 证书申请等功能。通过 1Panel 可在 Web 界面完成全部部署，无需 SSH 命令行操作。

### 4.1 安装 1Panel 面板

**环境要求**：Ubuntu 22.04+ / Debian 12+ / CentOS 8+，可用内存 1GB+，可访问互联网。

在服务器 SSH 终端执行一键安装脚本：

```bash
bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"
```

> 如 Docker 安装失败，可先单独安装 Docker：
> ```bash
> bash <(curl -sSL https://linuxmirrors.cn/docker.sh)
> ```
> 然后重新执行上面的 1Panel 安装脚本。

安装过程中根据提示设置：
- **安装路径**：默认 `/opt`
- **面板端口**：建议自定义（如 `10086`），避免被扫描
- **安全入口**：设置一个随机字符串（如 `entrance-xyz123`）
- **面板账号和密码**：用于登录面板

安装成功后控制台会打印访问信息：

```
面板地址: http://服务器IP:10086/entrance-xyz123
账号:     你的账号
密码:     你的密码
```

> **重要**：云服务器请在安全组放行面板端口（如 10086）和后续应用端口（如 80/443）。

### 4.2 登录面板并初始化

1. 浏览器访问 `http://服务器IP:端口/安全入口`
2. 输入账号密码登录
3. 进入面板后，在「概览」页确认 Docker 和 Docker Compose 已正常安装（1Panel 会自动安装）

### 4.3 上传项目文件

**方式一：通过 1Panel 文件管理器上传**

1. 进入面板「主机 → 文件」
2. 导航到 `/opt/tongji`（如不存在则创建）
3. 点击「上传」，将项目代码压缩包上传并解压

**方式二：通过 SSH 克隆（推荐）**

```bash
# SSH 登录服务器
mkdir -p /opt/tongji
cd /opt/tongji
git clone <项目仓库地址> .
```

**方式三：通过 1Panel 终端**

1. 进入面板「主机 → 终端」
2. 执行上述 git clone 命令

### 4.4 配置环境变量

1. 进入面板「主机 → 文件」
2. 导航到 `/opt/tongji` 目录
3. 复制 `.env.example` 为 `.env`（右键 → 复制 → 重命名）
4. 双击编辑 `.env`，修改以下关键项：

```env
# ---------- MariaDB 数据库连接 ----------
# 注意：必须使用 mysql:// 协议（Prisma CLI 不识别 mariadb://）
# 主机地址根据 MariaDB 位置选择：
#   - 同宿主机：host.docker.internal
#   - 远程服务器：填写 IP，如 192.168.1.100
DATABASE_URL=mysql://tongji:tongji123@host.docker.internal:3306/tongji

# ---------- 应用配置 ----------
APP_PORT=80
JWT_SECRET=用 openssl rand -base64 48 生成
JWT_EXPIRES_IN=7d
```

> 在 1Panel 终端执行 `openssl rand -base64 48` 生成 JWT 密钥。

> **前置准备**：在外部已搭建的 MariaDB 中创建数据库和用户：
> ```sql
> CREATE DATABASE tongji CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE USER 'tongji'@'%' IDENTIFIED BY 'tongji123';
> GRANT ALL PRIVILEGES ON tongji.* TO 'tongji'@'%';
> FLUSH PRIVILEGES;
> ```

### 4.5 创建 Compose 编排

1. 进入面板「容器 → 编排」
2. 点击「创建编排」
3. **名称**：填 `tongji`
4. **来源**：选择「使用现有 Compose 文件」
5. **路径**：填 `/opt/tongji`（项目根目录，包含 `docker-compose.yml` 的位置）
6. 1Panel 会自动读取 `docker-compose.yml` 内容显示在编辑框中
7. 确认内容无误后点击「确认」

编排创建后，1Panel 会自动拉取镜像并启动容器。

### 4.6 查看容器状态

1. 进入「容器 → 容器」
2. 确认 `tongji-app` 容器为 `running` 状态（含 Nginx + Node.js）
3. 进入「容器 → 编排 → tongji → 日志」，查看启动日志：
   ```
   [1/4] 等待 MariaDB 就绪...
   [2/4] 执行数据库迁移...
   [3/4] 启动 Nginx + Node.js...
   [4/4] 初始化会长账户...
   服务已启动
   ```

> 如启动时「等待 MariaDB 就绪」超时，请检查：
> - `.env` 中 `DATABASE_URL` 的主机地址是否可达
> - 外部 MariaDB 是否已授权 `'tongji'@'%'` 用户
> - MariaDB 的 `bind-address` 是否允许 Docker 网段连接

### 4.7 验证部署

在 1Panel 终端或本地浏览器访问：

```bash
# 健康检查
curl http://localhost/health
# 返回 {"status":"ok","timestamp":"..."}
```

浏览器访问 `http://服务器IP`，使用默认账户登录：
- 用户名：`admin`
- 密码：`admin123`

> 首次登录后请立即修改密码。

### 4.8 配置网站反向代理（HTTPS）

通过 1Panel 网站管理配置反向代理和 SSL 证书，无需手动编辑 Nginx 配置。

**前提**：已将域名解析到服务器 IP。

1. 进入面板「网站 → 网站」
2. 点击「创建网站 → 反向代理」
3. 填写：
   - **主域名**：`your-domain.com`
   - **代号**：`tongji`
   - **代理地址**：`http://127.0.0.1:80`（Docker 应用端口，对应 `.env` 中 `APP_PORT`）
4. 点击「确认」创建

**申请 SSL 证书**：

1. 在网站列表中找到刚创建的站点，点击「HTTPS」
2. 选择「申请 Let's Encrypt 证书」
3. 勾选域名，点击「申请」（需确保域名已解析且 80 端口可访问）
4. 申请成功后，开启「强制 HTTPS」跳转
5. 1Panel 会自动配置定时续期

> **国内服务器**：如 80/443 端口被封，可在 1Panel 中将应用端口改为非标准端口（如 `.env` 中 `APP_PORT=5678`），反向代理地址同步改为 `http://127.0.0.1:5678`。

### 4.9 防火墙配置

在 1Panel 中管理防火墙：

1. 进入「主机 → 防火墙」（需服务器安装 firewalld 或 ufw）
2. 放行端口：
   - `80/tcp`（HTTP）
   - `443/tcp`（HTTPS）
   - 面板端口（如 `10086/tcp`）
3. **不要对外暴露** 3001（后端），仅容器内部 Nginx 代理访问
4. MariaDB 3306 端口访问控制由外部数据库实例自行配置

或在终端配置 UFW：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 10086/tcp    # 1Panel 面板端口
sudo ufw enable
```

### 4.10 常用运维操作

**查看日志**：
- 应用日志：「容器 → 编排 → tongji → 日志」（包含 Nginx 和 Node.js）

**重启服务**：
- 「容器 → 编排 → tongji → 重启」

**更新部署**：
1. SSH 或 1Panel 终端执行 `cd /opt/tongji && git pull`
2. 进入「容器 → 编排 → tongji」
3. 点击「重建」（会重新构建镜像并启动）

**数据库管理**（外部 MariaDB）：
1. 进入「数据库 → MySQL」（1Panel 可管理宿主机安装的 MariaDB）
2. 或安装 phpMyAdmin（1Panel 应用商店）连接外部 MariaDB
3. 连接信息：
   - 主机：MariaDB 服务器 IP（同宿主机为 `127.0.0.1`）
   - 端口：`3306`
   - 账号：`DATABASE_URL` 中的用户名（如 `tongji`）
   - 密码：`DATABASE_URL` 中的密码
   - 数据库：`DATABASE_URL` 中的数据库名（如 `tongji`）

**数据库备份**：
1. 进入「计划任务 → 添加任务」
2. 类型选择「Shell 脚本」
3. 脚本内容（连接外部 MariaDB，主机按实际情况修改）：
   ```bash
   mysqldump -u tongji -ptongji123 -h 127.0.0.1 tongji > /opt/tongji/backups/backup-$(date +%Y%m%d).sql
   ```
4. 设置执行周期（如每天 03:00）
5. 可配合「备份账号」上传到对象存储

---

## 5. Linux 服务器手动部署（非 Docker）

> 如已使用 Docker 或 1Panel 部署，可跳过此章节。

### 5.1 环境准备

Ubuntu 使用 apt 作为包管理器：

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 20.x LTS（NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v   # v20.x.x
npm -v    # 10.x.x

# 安装 PM2 进程守护
sudo npm install -g pm2

# 安装 Nginx + git + MariaDB 客户端
sudo apt install -y nginx git mariadb-server mariadb-client

# 启动 MariaDB 并设置开机自启
sudo systemctl enable --now mariadb

# 初始化 MariaDB 安全配置
sudo mysql_secure_installation
```

> **备选**：如需特定 Node 版本，可使用 nvm：
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

### 5.2 获取代码并安装依赖

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

### 5.3 配置后端环境

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
DATABASE_URL="mysql://tongji:tongji123@127.0.0.1:3306/tongji"
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

### 5.4 构建后端

```bash
cd /opt/tongji/server
npm run build
# 构建产物位于 server/dist/ 目录
```

### 5.5 构建前端

```bash
cd /opt/tongji/client
npm run build
# 构建产物位于 client/dist/ 目录
```

### 5.6 初始化会长账户

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

### 5.7 使用 PM2 管理后端进程

```bash
cd /opt/tongji/server

# 启动后端服务
pm2 start dist/src/index.js --name tongji-server

# 保存进程列表
pm2 save

# 设置开机自启（按提示执行返回的命令）
pm2 startup systemd
```

常用命令：

```bash
pm2 status                # 查看状态
pm2 logs tongji-server    # 查看日志
pm2 restart tongji-server # 重启
pm2 stop tongji-server    # 停止
pm2 delete tongji-server  # 删除
```

### 5.8 配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/tongji
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
sudo ln -s /etc/nginx/sites-available/tongji /etc/nginx/sites-enabled/

# 删除默认站点（避免冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 启动 Nginx 并设置开机自启
sudo systemctl enable --now nginx

# 重载配置
sudo systemctl reload nginx
```

### 5.9 配置 HTTPS（推荐）

使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 自动配置 HTTPS（会自动修改 Nginx 配置并强制跳转）
sudo certbot --nginx -d your-domain.com

# 验证自动续期（Ubuntu 已自动配置 systemd timer）
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### 5.10 防火墙配置

Ubuntu 使用 UFW：

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# 查看状态
sudo ufw status verbose

# 注意：后端 3001 端口无需对外暴露，仅 Nginx 通过 127.0.0.1 访问
```

---

## 6. 更新部署（手动）

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

## 7. 数据库备份

### 7.1 自动备份

系统已内置自动备份功能，后端服务启动时会自动注册定时任务：

- **执行时间**：每天凌晨 3:00
- **备份方式**：`mysqldump` 导出 SQL 文件
- **备份目录**：`server/backups/`（Docker 环境为容器内 `/app/backups/`）
- **文件名格式**：`backup-YYYY-MM-DD-HH-mm-ss.sql`
- **保留策略**：自动清理超过 30 天的旧备份

无需额外配置，定时任务在后端启动时自动注册。

> **依赖**：系统需安装 `mysqldump` 命令。Docker 镜像已内置；手动部署需安装 `mariadb-client`（Ubuntu：`sudo apt install mariadb-client`）。

### 7.2 手动备份

```bash
# 手动部署环境
cd /opt/tongji/server
npx tsx scripts/backup.ts

# 或直接使用 mysqldump
mysqldump -u tongji -p tongji > backup-$(date +%Y%m%d).sql
```

### 7.3 数据恢复

```bash
# 恢复 SQL 备份到 MariaDB
mariadb -u tongji -p tongji < /opt/tongji/server/backups/backup-YYYY-MM-DD-HH-mm-ss.sql

# 或在 Docker 环境中（连接外部 MariaDB）
docker compose exec -T app sh -c 'mariadb -u tongji -ptongji123 -h host.docker.internal tongji' < backup.sql
```

### 7.4 异地备份（推荐）

将备份目录定期同步到异地或对象存储：

```bash
# 示例：每天凌晨 4 点 rsync 到另一台服务器
echo "0 4 * * * rsync -az /opt/tongji/server/backups/ user@backup-server:/backup/tongji/" | crontab -
```

---

## 8. 运行测试

### 8.1 后端单元测试

```bash
cd server
npm test
```

测试使用 Vitest 框架，使用独立的 MariaDB 测试数据库 `tongji_test`，不影响开发/生产数据。

> 前置条件：本地 MariaDB 服务已启动（`docker compose -f docker-compose.dev.yml up -d`）。

### 8.2 前端构建检查

```bash
cd client
npm run build
```

---

## 9. 关键配置说明

| 配置项 | 位置 | 说明 |
|--------|------|------|
| 数据库连接 | `server/.env` 的 `DATABASE_URL` | MariaDB 连接串 `mysql://user:pass@host:3306/db`（必须 mysql:// 协议） |
| 后端监听 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `host: '::'` | IPv4/IPv6 双栈监听 |
| 后端端口 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `port: 3001` | 仅需对 Nginx 暴露，无需公网开放 |
| CORS | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `origin: true` | 允许所有来源，生产由 Nginx 同源代理兜底 |
| JWT 密钥 | `server/.env` 的 `JWT_SECRET` | 生产环境务必修改为复杂值，至少 32 字节 |
| JWT 有效期 | `server/.env` 的 `JWT_EXPIRES_IN` | 默认 7 天 |
| 前端 API 路径 | [client/src/api/index.ts](file:///e:/1Xiangmu/tongji/client/src/api/index.ts) `baseURL: '/api'` | 相对路径，由 Nginx/Vite proxy 转发 |
| 文件上传限制 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `limits.fileSize` | 默认 10MB |

---

## 10. 常见问题

### Q1: 启动后端报错 "Can't reach database server"？

外部 MariaDB 服务未启动或连接信息错误：

```bash
# 1. 确认 MariaDB 服务运行中（在 MariaDB 所在服务器）
sudo systemctl status mariadb
sudo systemctl start mariadb

# 2. 验证从 Docker 容器能否连接
docker compose exec app sh -c 'node -e "
  const net = require(\"net\");
  const url = new URL(process.env.DATABASE_URL);
  const s = new net.Socket();
  s.setTimeout(3000);
  s.on(\"connect\", () => { console.log(\"OK\"); s.destroy(); process.exit(0); });
  s.on(\"error\", (e) => { console.log(\"FAIL: \" + e.message); process.exit(1); });
  s.on(\"timeout\", () => { console.log(\"TIMEOUT\"); process.exit(1); });
  s.connect(url.port, url.hostname);
"'

# 3. 检查 .env 中 DATABASE_URL 主机地址是否正确
#    - 同宿主机 MariaDB：host.docker.internal
#    - 远程 MariaDB：服务器 IP

# 4. 检查 MariaDB 用户授权
#    登录 MariaDB 后执行：
#    SELECT user, host FROM mysql.user WHERE user='tongji';
#    确保存在 'tongji'@'%' 或对应 Docker 网段的记录
```

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

Docker 环境：连接外部 MariaDB 重置数据库：

```bash
# 备份
mysqldump -u tongji -ptongji123 -h 127.0.0.1 tongji > backup.sql

# 重置
mariadb -u tongji -ptongji123 -h 127.0.0.1 \
  -e "DROP DATABASE tongji; CREATE DATABASE tongji CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 重新部署会自动执行迁移
docker compose up -d --build
```

### Q3: 前端页面空白 / API 报 404？

检查 Nginx 配置：

1. `location /api/` 的 `proxy_pass` 末尾**不要加斜杠**（`http://127.0.0.1:3001` 而非 `http://127.0.0.1:3001/`），否则路径会被截断
2. `location /` 的 `try_files` 必须包含 `/index.html`，否则 SPA 路由刷新 404
3. 确认后端已启动：`pm2 status`、`curl http://127.0.0.1:3001/health`
4. 确认已删除默认站点：`sudo rm -f /etc/nginx/sites-enabled/default`

### Q4: 如何修改 JWT 密钥？

修改 `server/.env` 文件中的 `JWT_SECRET` 值，重启后端即可。修改后所有已登录用户的 token 将失效，需重新登录。

```bash
# 生成强随机密钥
openssl rand -base64 48

# 编辑 .env，修改 JWT_SECRET 后重启
pm2 restart tongji-server
```

Docker 环境：修改 `.env` 后 `docker compose up -d`（会自动重建 app 容器）。

### Q5: 如何修改后端端口？

修改 [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) 中 `fastify.listen({ port: 3001 })` 的端口号，同步更新：

- Nginx 配置中 `proxy_pass http://127.0.0.1:新端口`
- 开发环境还需更新 [client/vite.config.ts](file:///e:/1Xiangmu/tongji/client/vite.config.ts) 中 `proxy['/api'].target`
- Docker 环境：容器内端口由 `docker/nginx.conf` 配置，通常无需修改

### Q6: 数据库越来越大怎么办？

MariaDB 删除数据后可通过 OPTIMIZE TABLE 回收空间：

```bash
# 手动优化所有表（连接外部 MariaDB）
mariadb -u tongji -ptongji123 -h 127.0.0.1 tongji \
  -e "OPTIMIZE TABLE Account, Branch, Personnel, PersonnelBranch, DataRecord, DataHistory, RewardRule, Notification;"

# 或从容器内连接
docker compose exec app sh -c 'mariadb -u tongji -ptongji123 -h host.docker.internal tongji \
  -e "OPTIMIZE TABLE Account, Branch, Personnel, PersonnelBranch, DataRecord, DataHistory, RewardRule, Notification;"'
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
2. 放行防火墙：`sudo ufw allow 80/tcp`（UFW 默认同时放行 IPv4/IPv6）
3. Nginx 配置中取消 `listen [::]:80;` 注释
4. 检查云服务商安全组是否放行 IPv6 入站
5. 部分家用宽带的 80/443 端口被运营商封锁，需改用非标准端口（如 5678）

### Q9: PM2 日志在哪里？

```bash
pm2 logs tongji-server --lines 100   # 查看最近 100 行
# 日志文件默认位于 ~/.pm2/logs/
```

### Q10: Docker 容器启动失败怎么办？

```bash
# 查看启动日志
docker compose logs app

# 常见原因：
# 1. MariaDB 未就绪 → 检查外部 MariaDB 服务状态和连接串
# 2. 数据库迁移失败 → 进入容器手动执行 npx prisma migrate deploy
# 3. 端口被占用 → 修改 .env 中 APP_PORT
# 4. 权限问题 → 确保当前用户在 docker 组中

# 进入容器调试
docker compose exec app sh

# 完全重建（会重建容器，数据库数据在外部 MariaDB 不受影响）
docker compose down
docker compose up -d --build
```

### Q11: 如何查看 Docker 容器资源占用？

```bash
# 实时查看容器资源占用
docker stats

# 查看磁盘使用
docker system df

# 清理未使用的镜像和容器
docker system prune -a
```
