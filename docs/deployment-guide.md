# 系统部署指南

## 1. 环境要求

| 软件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Node.js | 18.0+ | 20.x LTS | 后端运行环境 |
| npm | 9.0+ | 10.x | 包管理工具 |
| 操作系统 | — | Linux / Windows / macOS | 推荐 Linux 服务器部署 |

### 技术栈

- **后端**：Fastify 5.x + Prisma 7.x + SQLite (better-sqlite3)
- **前端**：React 19 + Vite 8 + TailwindCSS 3
- **定时任务**：node-cron（数据库自动备份）

---

## 2. 本地开发部署

### 2.1 克隆项目

```bash
git clone <项目仓库地址>
cd tongji
```

### 2.2 安装依赖

项目根目录已配置 workspace 脚本，可一键安装所有依赖：

```bash
# 在根目录执行，安装根目录、server、client 的依赖
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

或分别安装：

```bash
# 后端依赖
cd server
npm install

# 前端依赖
cd ../client
npm install
```

### 2.3 配置数据库

后端使用 SQLite，数据库文件为 `server/dev.db`，无需额外安装数据库服务。

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

# 创建数据库并应用迁移
npx prisma migrate dev
```

### 2.5 初始化会长账户

启动后端服务后，调用种子接口创建默认会长账户：

```bash
# 启动后端
npm run dev

# 在另一个终端执行（创建会长账户）
curl -X POST http://localhost:3001/api/seed
```

默认会长账户：
- 用户名：`admin`
- 密码：`admin123`

### 2.6 启动开发服务

**方式一：一键启动前后端（推荐）**

在项目根目录执行：

```bash
npm run dev
```

此命令使用 `concurrently` 同时启动前后端开发服务器。

**方式二：分别启动**

```bash
# 终端1 - 启动后端（端口 3001）
cd server
npm run dev

# 终端2 - 启动前端（端口 5173）
cd client
npm run dev
```

### 2.7 访问系统

- 前端页面：http://localhost:5173
- 后端 API：http://localhost:3001
- 健康检查：http://localhost:3001/health

---

## 3. 服务器部署

### 3.1 环境准备

```bash
# 安装 Node.js（以 Ubuntu 为例）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

### 3.2 获取代码并安装依赖

```bash
git clone <项目仓库地址> /opt/tongji
cd /opt/tongji

# 安装所有依赖
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 3.3 配置后端环境

```bash
cd /opt/tongji/server

# 配置环境变量
cat > .env << 'EOF'
DATABASE_URL="file:./dev.db"
EOF

# 运行迁移
npx prisma generate
npx prisma migrate deploy
```

### 3.4 构建前端

```bash
cd /opt/tongji/client
npm run build
```

构建产物位于 `client/dist/` 目录。

### 3.5 构建后端

```bash
cd /opt/tongji/server
npm run build
```

构建产物位于 `server/dist/` 目录。

### 3.6 使用 PM2 管理后端进程

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动后端服务
cd /opt/tongji/server
pm2 start dist/src/index.js --name tongji-api

# 设置开机自启
pm2 startup
pm2 save
```

### 3.7 配置 Nginx 反向代理

```nginx
# /etc/nginx/conf.d/tongji.conf

server {
    listen 80;
    server_name your-domain.com;

    # 前端静态资源
    location / {
        root /opt/tongji/client/dist;
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

    # 文件上传大小限制（Excel 导入）
    client_max_body_size 10m;
}
```

```bash
# 测试配置并重启 Nginx
sudo nginx -t
sudo systemctl reload nginx
```

### 3.8 配置 HTTPS（可选，推荐）

使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 自动配置 HTTPS
sudo certbot --nginx -d your-domain.com

# 证书自动续期（已自动配置定时任务）
sudo certbot renew --dry-run
```

---

## 4. 数据库备份

### 4.1 自动备份

系统已内置自动备份功能，后端服务启动后会自动注册定时任务：

- **执行时间**：每天凌晨 3:00
- **备份目录**：`server/backups/`
- **文件名格式**：`backup-YYYY-MM-DD-HH-mm-ss.db`
- **保留策略**：自动清理超过 30 天的旧备份

定时任务在后端服务启动时自动注册，无需额外配置。

### 4.2 手动备份

```bash
cd /opt/tongji/server
npx tsx scripts/backup.ts
```

### 4.3 数据恢复

```bash
# 停止后端服务
pm2 stop tongji-api

# 用备份文件替换当前数据库
cp /opt/tongji/server/backups/backup-YYYY-MM-DD-HH-mm-ss.db /opt/tongji/server/dev.db

# 重启后端服务
pm2 start tongji-api
```

---

## 5. 运行测试

### 5.1 后端单元测试

```bash
cd server
npm test
```

测试使用 Vitest 框架，包含：
- 认证接口测试（登录成功/失败、获取当前用户）
- 福利计算测试（基础福利、排名奖励、麦序达标奖励）

测试使用独立的 `test.db` 数据库，不影响开发数据。

### 5.2 前端构建检查

```bash
cd client
npm run build
```

---

## 6. 常见问题解答

### Q1: 启动后端报错 "Cannot find module 'better-sqlite3'？

better-sqlite3 是原生模块，需要编译。请确保系统已安装编译工具：

```bash
# Ubuntu
sudo apt-get install -y python3 make g++

# 重新安装
cd server
npm rebuild better-sqlite3
```

### Q2: Prisma 迁移报错 "Migration failed"？

可能是数据库文件被锁定或损坏。删除数据库文件后重新迁移：

```bash
cd server
rm -f dev.db dev.db-journal
npx prisma migrate dev
```

### Q3: 前端页面空白，控制台报 CORS 错误？

后端 CORS 配置仅允许 `http://localhost:5173`。生产环境部署时需修改 `server/src/index.ts` 中的 CORS 配置，或通过 Nginx 反向代理统一域名。

### Q4: 如何修改 JWT 密钥？

修改 `server/src/utils/jwt.ts` 和 `server/src/index.ts` 中的 `JWT_SECRET` 值。修改后所有已登录用户的 token 将失效，需重新登录。

### Q5: 如何修改后端端口？

修改 `server/src/index.ts` 中 `fastify.listen({ port: 3001 })` 的端口号，同时更新前端 `client/src/api/index.ts` 中的 API 基础地址。

### Q6: 数据库文件越来越大怎么办？

SQLite 数据库删除数据后不会自动释放空间。可执行 VACUUM 命令压缩：

```bash
cd server
sqlite3 dev.db "VACUUM;"
```

### Q7: 如何查看数据库内容？

使用 Prisma Studio 可视化工具：

```bash
cd server
npx prisma studio
```

浏览器访问 http://localhost:5555 即可查看和编辑数据。
