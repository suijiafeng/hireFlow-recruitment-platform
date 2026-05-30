#!/bin/sh
# API 容器入口：结构迁移 → 幂等种子 → 启动服务
# 种子可重复执行：权限点/账号 upsert 对齐；角色权限仅 ADMIN 强制全量对齐，
# 其余角色只在首次创建时写默认值（设置页的自定义权限重启后存活）；
# 演示业务数据有 job.count() 守卫（见 prisma/seed.ts）
set -e

echo "[entrypoint] prisma migrate deploy ..."
npx prisma migrate deploy

echo "[entrypoint] db seed (idempotent) ..."
npm run db:seed

echo "[entrypoint] starting api ..."
exec node dist/main.js
