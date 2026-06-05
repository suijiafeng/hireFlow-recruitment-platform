#!/bin/sh
# API 容器入口：结构迁移 → 幂等种子 → 启动服务
# 种子可重复执行：权限点/账号 upsert 对齐；角色权限仅 ADMIN 强制全量对齐，
# 其余角色只在首次创建时写默认值（设置页的自定义权限重启后存活）；
# 演示业务数据有 job.count() 守卫（见 prisma/seed.ts）
#
# 注意：基础镜像是 node:22-alpine，/bin/sh 是 BusyBox ash（非 bash），
# 脚本中禁止使用 <<<、[[ ]] 等 bashism。

MAX_RETRIES=30
RETRY_INTERVAL=2

echo "[entrypoint] 启动 HireFlow API..."

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
  npm run db:seed || echo "[entrypoint] ⚠ 种子执行失败，继续启动应用"
else
  echo "[entrypoint] ⚠ 数据库迁移多次重试仍失败，跳过迁移与种子，直接启动应用"
fi

echo "[entrypoint] 启动应用 (端口: ${PORT:-3000})..."
exec node dist/main.js
