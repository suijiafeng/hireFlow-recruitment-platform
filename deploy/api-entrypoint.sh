#!/bin/sh
# API 容器入口：结构迁移 → 幂等种子 → 启动服务
# 种子可重复执行：角色/权限/账号 upsert 对齐，演示业务数据有 job.count() 守卫（见 prisma/seed.ts）
set -e

echo "[entrypoint] prisma migrate deploy ..."
npx prisma migrate deploy

echo "[entrypoint] db seed (idempotent) ..."
npm run db:seed

echo "[entrypoint] starting api ..."
exec node dist/main.js
