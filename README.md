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
docker compose up -d          # postgres / redis
cp apps/api/.env.example apps/api/.env

npm run db:migrate            # 应用数据库迁移
npm run db:generate           # 生成 Prisma Client 到 apps/api/src/generated
npm run db:seed               # 写入角色/权限/测试账号
npm run dev                   # shared 监听编译 + api(:3000) + web(:5173)
```

打开 http://localhost:5173 ，接口文档在 http://localhost:3000/api/docs 。

### 测试账号（密码统一 `Admin@123456`）

| 账号 | 角色 |
|---|---|
| admin@arthr.local | 系统管理员 |
| hr@arthr.local | HR / 招聘专员 |
| manager@arthr.local | 用人经理 |
| interviewer@arthr.local | 面试官 |
| it@arthr.local | IT / 行政 |

## 目录结构

```
apps/api        NestJS 后端（modules: auth/users/rbac/departments/activity-log）
apps/web        React 前端（登录/数据大盘/职位/候选人/招聘看板/面试/设置）
packages/shared 前后端共享枚举与权限码（CJS + ESM 双产物）
```

## 实施路线图

- [x] 一期 主线 MVP：RBAC 权限、职位管理、候选人库、Pipeline 看板（乐观锁/受控回退/SLA 标色）、面试安排与面评、操作留痕
- [x] 二期 AI 增强：可插拔 AI 网关（Anthropic/Mock 双引擎自动降级）、JD 生成、简历解析与人岗匹配评分、面评草稿、留存预测、入职问答、数据大盘
- [x] 三期 自动化与入职：Offer 审批状态机与免登录门户、入职闭环（三方清单/OCR/电子签）、Helpdesk、通知中心、待办聚合、审计日志
- [ ] 收尾：文件留档（对象存储）、数据行级权限、人才库唤醒与数据洞察

## 免登录门户（候选人 / 新员工）

Offer 发送后自动生成一次性链接（192 位随机令牌，链接即凭证）：

- `/portal/offer/:token` 候选人查看 Offer、接受或带原因码拒绝；答复截止 5 个工作日（懒过期，可续期一次）
- `/portal/onboarding/:token` 新员工查看入职清单进度、粘贴证件文本自动 OCR 归档、签署电子合同

招聘数据不做物理删除（合规审计要求）：淘汰/撤回/关闭/取消均为带原因码的状态终结，完整留痕于时间轴。
