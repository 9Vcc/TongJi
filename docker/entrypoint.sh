#!/bin/sh
set -e

echo "=========================================="
echo "  统计系统 Docker 启动"
echo "=========================================="

# ---------- 1. 等待 MariaDB 就绪 ----------
echo "[1/4] 等待 MariaDB 就绪..."
MAX_RETRIES=30
for i in $(seq 1 $MAX_RETRIES); do
    if node -e "
        const net = require('net');
        const url = new URL(process.env.DATABASE_URL);
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => { socket.destroy(); process.exit(0); });
        socket.on('error', () => process.exit(1));
        socket.on('timeout', () => { socket.destroy(); process.exit(1); });
        socket.connect(url.port, url.hostname);
    " 2>/dev/null; then
        echo "  MariaDB 已就绪 (第 ${i} 次尝试)"
        break
    fi
    if [ "$i" = "$MAX_RETRIES" ]; then
        echo "  [错误] MariaDB 连接超时，请检查数据库服务是否正常"
        exit 1
    fi
    echo "  等待中... (${i}/${MAX_RETRIES})"
    sleep 2
done

# ---------- 2. 执行数据库迁移 ----------
echo "[2/4] 执行数据库迁移..."
cd /app
npx prisma migrate deploy
echo "  迁移完成"

# ---------- 3. 启动服务 ----------
echo "[3/4] 启动 Nginx + Node.js..."
nginx -g "daemon off;" &
NGINX_PID=$!

node dist/src/index.js &
NODE_PID=$!

# 等待后端就绪后初始化会长账户（仅当环境变量 SEED_ADMIN=1 时执行）
# 首次部署：在 docker-compose.yml 设置 SEED_ADMIN=1，或运行 docker exec <容器> sh -c 'SEED_ADMIN=1 ...'
# 后续更新部署：移除该环境变量或留空，启动时不再触发 seed
if [ "$SEED_ADMIN" = "1" ]; then
    echo "[4/4] 初始化会长账户..."
    sleep 3
    node -e "
        const http = require('http');
        const req = http.request({ hostname: '127.0.0.1', port: 3001, path: '/api/seed', method: 'POST' }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { console.log('  ' + JSON.parse(data).message); } catch(e) { console.log('  会长账户检查完成'); }
            });
        });
        req.on('error', () => console.log('  会长账户初始化跳过'));
        req.end();
    " 2>/dev/null || true
else
    echo "[4/4] 跳过会长账户初始化（如需初始化请设置环境变量 SEED_ADMIN=1）"
fi

echo "=========================================="
echo "  服务已启动"
echo "  前端: http://localhost (Nginx)"
echo "  API:  http://localhost/api (代理到 :3001)"
echo "=========================================="

# 捕获信号，优雅退出
trap "echo '正在关闭...'; kill $NGINX_PID $NODE_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# 等待任意子进程退出（Alpine ash 不支持 wait -n，使用轮询）
while kill -0 "$NGINX_PID" 2>/dev/null && kill -0 "$NODE_PID" 2>/dev/null; do
    sleep 1
done

echo "子进程退出，正在关闭..."
kill "$NGINX_PID" "$NODE_PID" 2>/dev/null || true
exit 1
