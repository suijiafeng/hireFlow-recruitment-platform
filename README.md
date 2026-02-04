# HireFlow · AI-Powered Recruitment Platform

开源智能招聘系统（ATS）：以「候选人流转看板」为中枢、「AI Copilot」为差异化、「自动化工作流」贯穿录用入职。

## 技术栈

| 端 | 栈 |
|---|---|
| 前端 `apps/web` | Vite 8 + React 19 + TypeScript + Ant Design 6 + react-router 8 + TanStack Query + zustand + dnd-kit |
| 后端 `apps/api` | NestJS 11 + Prisma 7（driver adapter）+ PostgreSQL 18 + JWT + Swagger |
| 共享 `packages/shared` | 枚举 / 权限码 / 常量（CJS + ESM 双产物） |
| 基础设施 | Docker Compose：PostgreSQL / Redis |

## 快速开始

前置：Node ≥ 20.19、Docker。

```bash
npm install
docker compose up -d
```
