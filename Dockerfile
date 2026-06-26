# ============================================
# 多阶段构建：前端 + 后端 + Nginx
# ============================================

# ---------- Stage 1: 构建前端 ----------
FROM node:22-alpine AS client-build
WORKDIR /app/client

# 先复制依赖文件，利用 Docker 层缓存
COPY client/package.json client/package-lock.json* ./
RUN npm ci

# 复制源码并构建
COPY client/ ./
RUN npm run build


# ---------- Stage 2: 构建后端 ----------
FROM node:22-alpine AS server-build
WORKDIR /app/server

# 复制依赖文件
COPY server/package.json server/package-lock.json* ./
RUN npm ci

# 复制源码（含 prisma schema）
COPY server/ ./

# 生成 Prisma 客户端
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build


# ---------- Stage 3: 运行时 ----------
FROM node:22-alpine AS runtime

# 安装 nginx + mariadb-client（用于数据库备份 mysqldump）
RUN apk add --no-cache nginx mariadb-client

WORKDIR /app

# 安装生产依赖（prisma CLI 用于 migrate deploy）
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

# 复制后端构建产物
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/prisma.config.ts ./prisma.config.ts

# 复制前端构建产物（nginx 静态文件）
COPY --from=client-build /app/client/dist ./public

# 复制 nginx 配置
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# 复制启动脚本
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
