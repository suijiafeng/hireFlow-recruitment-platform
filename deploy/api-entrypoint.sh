#!/bin/sh
# API 容器入口：结构迁移 → 幂等种子 → 启动服务
# 种子可重复执行：权限点/账号 upsert 对齐；角色权限仅 ADMIN 强制全量对齐，
# 其余角色只在首次创建时写默认值（设置页的自定义权限重启后存活）；
# 演示业务数据有 job.count() 守卫（见 prisma/seed.ts）

MAX_RETRIES=30
RETRY_INTERVAL=2

# 函数：等待数据库就绪
wait_for_db() {
  local attempt=1
  while [ $attempt -le $MAX_RETRIES ]; do
    echo "[entrypoint] 等待数据库就绪 (尝试 $attempt/$MAX_RETRIES)..."
    if npx prisma db execute --stdin <<< "SELECT 1" 2>/dev/null; then
      echo "[entrypoint] ✓ 数据库已就绪"
      return 0
    fi
    sleep $RETRY_INTERVAL
    attempt=$((attempt + 1))
  done

  echo "[entrypoint] ⚠ 数据库连接超时，跳过迁移，直接启动应用"
  return 1
}

echo "[entrypoint] 启动 HireFlow API..."

# 尝试等待数据库
if wait_for_db; then
  echo "[entrypoint] prisma migrate deploy..."
  npx prisma migrate deploy || echo "[entrypoint] ⚠ 迁移失败或已是最新版本"

  echo "[entrypoint] db seed (幂等)..."
  npm run db:seed || echo "[entrypoint] ⚠ 种子执行失败（数据库可能未初始化）"
fi

echo "[entrypoint] 启动应用 (端口: $PORT)..."
exec node dist/main.js
