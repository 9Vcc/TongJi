# ============================================
# 多阶段构建：前端 + 后端 + Nginx
# ============================================

# 全局 npm 配置：国内镜像源 + 超时延长，避免 Docker 构建时网络不稳定
# 通过 build arg 可在构建时覆盖镜像源：--build-arg NPM_REGISTRY=...
ARG NPM_REGISTRY=https://registry.npmmirror.com

# ---------- Stage 1: 构建前端 ----------
FROM node:22-alpine AS client-build
ARG NPM_REGISTRY
WORKDIR /app/client

# 先复制依赖文件，利用 Docker 层缓存
COPY client/package.json client/package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000 && \
    npm ci

# 复制源码并构建
COPY client/ ./
RUN npm run build


# ---------- Stage 2: 构建后端 ----------
FROM node:22-alpine AS server-build
ARG NPM_REGISTRY
WORKDIR /app/server

# 复制依赖文件
COPY server/package.json server/package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000 && \
    npm ci

# 复制源码（含 prisma schema）
COPY server/ ./

# 生成 Prisma 客户端
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build


# ---------- Stage 3: 运行时 ----------
FROM node:22-alpine AS runtime
ARG NPM_REGISTRY

# 安装 nginx + mariadb-client（用于数据库备份 mysqldump）
RUN apk add --no-cache nginx mariadb-client

# node:22-alpine 自带 node 用户（UID/GID 1000），直接复用作为非 root 运行用户
# （避免 addgroup 时 GID 1000 冲突）
WORKDIR /app

# 安装生产依赖（prisma CLI 用于 migrate deploy）
COPY server/package.json server/package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000 && \
    npm ci --omit=dev

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

# 设置目录权限：node 用户需读写 /app 及子目录
# nginx 以 node 用户运行，需可写 pid/log/temp 目录
RUN mkdir -p /run/nginx /var/lib/nginx/logs /var/lib/nginx/tmp /var/log/nginx && \
    chown -R node:node /app /run/nginx /var/lib/nginx /var/log/nginx /etc/nginx/http.d

EXPOSE 8080

# 以非 root 用户运行所有进程（nginx + node）
USER node

ENTRYPOINT ["/entrypoint.sh"]
