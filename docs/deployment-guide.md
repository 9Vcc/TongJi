# 系统部署指南

## 1. 环境要求

| 软件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Node.js | 18.0+ | 20.x LTS | 后端运行环境 |
| npm | 9.0+ | 10.x | 包管理工具 |
| Nginx | 1.18+ | 1.24+ | 反向代理与静态资源服务（生产） |
| PM2 | 5.0+ | 5.3+ | Node 进程守护（生产） |
| 操作系统 | — | Linux（Arch Linux / 通用发行版） | 推荐生产部署 |

### 技术栈

- **后端**：Fastify 5.x + Prisma 7.x + SQLite (better-sqlite3)
- **前端**：React 19 + Vite 8 + TailwindCSS 3
- **定时任务**：node-cron（数据库自动备份）

### 生产架构

```
公网用户 ──→ Nginx (80/443) ──┬─→ 静态文件 client/dist (前端)
                              └─→ 反向代理 /api → 127.0.0.1:3001 (后端 Node)
                                                       │
                                                       └─→ SQLite 文件 prod.db
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

### 2.3 配置数据库

后端使用 SQLite，无需额外安装数据库服务。默认数据库文件为 `server/dev.db`。

环境变量配置文件 `server/.env`：

```env
DATABASE_URL="file:./dev.db"
```

> SQLite 数据库文件会在首次运行迁移时自动创建。

### 2.4 运行数据库迁移

```bash
cd server

# 生成 Prisma Client
npx prisma generate

# 创建数据库并应用迁移（开发环境）
npx prisma migrate dev
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

## 3. Linux 服务器生产部署

### 3.1 环境准备

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

# 安装 Nginx + git
sudo pacman -S --needed nginx git

# 构建 better-sqlite3 原生模块所需工具
sudo pacman -S --needed python make gcc
```

> **备选**：如需特定 Node 版本，可安装 nvm：
> ```bash
> sudo pacman -S nvm
> echo 'source /usr/share/nvm/init-nvm.sh' >> ~/.bashrc
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

### 3.2 获取代码并安装依赖

```bash
sudo mkdir -p /opt/tongji
sudo chown $USER:$USER /opt/tongji

git clone <项目仓库地址> /opt/tongji
cd /opt/tongji

# 后端依赖（会编译 better-sqlite3 原生模块）
cd server
npm install

# 前端依赖
cd ../client
npm install
```

### 3.3 配置后端环境

```bash
cd /opt/tongji/server

# 配置生产数据库路径（建议放固定位置，避免相对路径漂移）
mkdir -p data
cat > .env << 'EOF'
DATABASE_URL="file:/opt/tongji/server/data/prod.db"
EOF

# 生成 Prisma Client
npx prisma generate

# 应用数据库迁移（生产环境用 deploy，不会重置数据）
npx prisma migrate deploy
```

### 3.4 构建后端

```bash
cd /opt/tongji/server
npm run build
# 构建产物位于 server/dist/ 目录
```

### 3.5 构建前端

```bash
cd /opt/tongji/client
npm run build
# 构建产物位于 client/dist/ 目录
```

### 3.6 初始化会长账户

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

### 3.7 使用 PM2 管理后端进程

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

### 3.8 配置 Nginx 反向代理

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

### 3.9 配置 HTTPS（推荐）

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

### 3.10 防火墙配置

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

## 4. 更新部署

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

## 5. 数据库备份

### 5.1 自动备份

系统已内置自动备份功能，后端服务启动时会自动注册定时任务：

- **执行时间**：每天凌晨 3:00
- **备份目录**：`server/backups/`
- **文件名格式**：`backup-YYYY-MM-DD-HH-mm-ss.db`
- **保留策略**：自动清理超过 30 天的旧备份

无需额外配置，定时任务在后端启动时自动注册。

### 5.2 手动备份

```bash
cd /opt/tongji/server
npx tsx scripts/backup.ts
```

### 5.3 数据恢复

```bash
# 停止后端
pm2 stop tongji-server

# 用备份文件替换当前数据库
cp /opt/tongji/server/backups/backup-YYYY-MM-DD-HH-mm-ss.db /opt/tongji/server/data/prod.db

# 重启后端
pm2 start tongji-server
```

### 5.4 异地备份（推荐）

将备份目录定期同步到异地或对象存储：

```bash
# 示例：每天凌晨 4 点 rsync 到另一台服务器
echo "0 4 * * * rsync -az /opt/tongji/server/backups/ user@backup-server:/backup/tongji/" | crontab -
```

---

## 6. 运行测试

### 6.1 后端单元测试

```bash
cd server
npm test
```

测试使用 Vitest 框架，使用独立的 `test.db` 数据库，不影响开发/生产数据。

### 6.2 前端构建检查

```bash
cd client
npm run build
```

---

## 7. 关键配置说明

| 配置项 | 位置 | 说明 |
|--------|------|------|
| 数据库路径 | `server/.env` 的 `DATABASE_URL` | 生产建议绝对路径 `file:/opt/tongji/server/data/prod.db` |
| 后端监听 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `host: '::'` | IPv4/IPv6 双栈监听 |
| 后端端口 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `port: 3001` | 仅需对 Nginx 暴露，无需公网开放 |
| CORS | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `origin: true` | 允许所有来源，生产由 Nginx 同源代理兜底 |
| JWT 密钥 | [server/src/utils/jwt.ts](file:///e:/1Xiangmu/tongji/server/src/utils/jwt.ts) `JWT_SECRET` | 生产环境务必修改为复杂值 |
| JWT 有效期 | [server/src/utils/jwt.ts](file:///e:/1Xiangmu/tongji/server/src/utils/jwt.ts) `JWT_EXPIRES_IN` | 默认 7 天 |
| 前端 API 路径 | [client/src/api/index.ts](file:///e:/1Xiangmu/tongji/client/src/api/index.ts) `baseURL: '/api'` | 相对路径，由 Nginx/Vite proxy 转发 |
| 文件上传限制 | [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) `limits.fileSize` | 默认 10MB |

---

## 8. 常见问题

### Q1: 启动后端报错 "Cannot find module 'better-sqlite3"？

better-sqlite3 是原生模块，需编译。确保系统已安装编译工具：

```bash
sudo pacman -S --needed python make gcc
cd /opt/tongji/server
npm rebuild better-sqlite3
```

若 Node 版本升级，需重新编译：`npm rebuild`。

### Q2: Prisma 迁移报错 "Migration failed"？

可能是数据库文件被锁定或损坏。备份后重置：

```bash
cd /opt/tongji/server
pm2 stop tongji-server
cp data/prod.db data/prod.db.bak  # 先备份
rm -f data/prod.db data/prod.db-journal
npx prisma migrate deploy
pm2 start tongji-server
# 重新初始化：curl -X POST http://localhost:3001/api/seed
```

### Q3: 前端页面空白 / API 报 404？

检查 Nginx 配置：

1. `location /api/` 的 `proxy_pass` 末尾**不要加斜杠**（`http://127.0.0.1:3001` 而非 `http://127.0.0.1:3001/`），否则路径会被截断
2. `location /` 的 `try_files` 必须包含 `/index.html`，否则 SPA 路由刷新 404
3. 确认后端已启动：`pm2 status`、`curl http://127.0.0.1:3001/health`

### Q4: 如何修改 JWT 密钥？

修改 [server/src/utils/jwt.ts](file:///e:/1Xiangmu/tongji/server/src/utils/jwt.ts) 的 `JWT_SECRET` 值，重新构建并重启后端。修改后所有已登录用户的 token 将失效，需重新登录。

### Q5: 如何修改后端端口？

修改 [server/src/index.ts](file:///e:/1Xiangmu/tongji/server/src/index.ts) 中 `fastify.listen({ port: 3001 })` 的端口号，同步更新：

- Nginx 配置中 `proxy_pass http://127.0.0.1:新端口`
- 开发环境还需更新 [client/vite.config.ts](file:///e:/1Xiangmu/tongji/client/vite.config.ts) 中 `proxy['/api'].target`

### Q6: 数据库文件越来越大怎么办？

SQLite 删除数据后不会自动释放空间。执行 VACUUM 压缩：

```bash
cd /opt/tongji/server
pm2 stop tongji-server
sqlite3 data/prod.db "VACUUM;"
pm2 start tongji-server
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
