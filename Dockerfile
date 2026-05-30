# HireFlow - AI-Powered Recruitment Platform (Multi-stage, dual target)
#   api —— NestJS backend (entrypoint includes prisma migrate + seed)
#   web —— nginx static site + /api reverse proxy
# Usage: docker compose --profile demo up -d --build

# ---- 依赖层：仅拷贝清单文件，充分利用缓存 ----
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# 保留 devDependencies：运行期入口需要 prisma CLI（迁移）与 tsx（种子）
RUN npm ci

# ---- 构建层：shared → prisma generate → api → web ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# prisma.config.ts 通过 env() 读取连接串；generate 不连库，给占位值即可
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build:shared \
  && npm run db:generate \
  && npm run build -w apps/api \
  && npm run build -w apps/web

# ---- API 运行时（演示取向：直接复用构建层，保留完整 workspace，可靠优先于体积）----
FROM build AS api
ENV NODE_ENV=production
COPY deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
WORKDIR /repo/apps/api
EXPOSE 3000
ENTRYPOINT ["api-entrypoint.sh"]

# ---- Web 运行时：nginx 托管静态产物并反代 /api ----
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
