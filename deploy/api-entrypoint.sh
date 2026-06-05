#!/bin/sh
# API 容器入口：先启动服务监听端口（Render 靠探测端口判定部署是否成功，
# 迁移/种子若放在监听之前且数据库一时连不上，会拖到探测超时），
# 数据库迁移与幂等种子放到后台异步执行，完成后自动生效、无需重启容器。
# 种子可重复执行：权限点/账号 upsert 对齐；角色权限仅 ADMIN 强制全量对齐，
# 其余角色只在首次创建时写默认值（设置页的自定义权限重启后存活）；
# 演示业务数据有 job.count() 守卫（见 prisma/seed.ts）
#
# 注意：基础镜像是 node:22-alpine，/bin/sh 是 BusyBox ash（非 bash），
# 脚本中禁止使用 <<<、[[ ]] 等 bashism。

MAX_RETRIES=15
RETRY_INTERVAL=3

echo "[entrypoint] 启动应用 (端口: ${PORT:-3000}) ..."
node dist/main.js &
APP_PID=$!

# 转发终止信号给应用进程，保证 Render 重新部署/重启时能优雅退出
trap 'kill -TERM "$APP_PID" 2>/dev/null' TERM INT

(
  attempt=1
  migrated=0
  while [ "$attempt" -le "$MAX_RETRIES" ]; do
    echo "[entrypoint] prisma migrate deploy (尝试 $attempt/$MAX_RETRIES)..."
    if npx prisma migrate deploy; then
      migrated=1
      break
    fi
    attempt=$((attempt + 1))
    sleep "$RETRY_INTERVAL"
  done

  if [ "$migrated" -eq 1 ]; then
    echo "[entrypoint] db seed (幂等)..."
    npm run db:seed || echo "[entrypoint] ⚠ 种子执行失败"
  else
    echo "[entrypoint] ⚠ 数据库迁移多次重试仍失败，应用已在运行，但数据库结构可能未就绪"
  fi
) &

wait "$APP_PID"
