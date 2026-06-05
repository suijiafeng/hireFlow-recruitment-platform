# HireFlow · AI-Powered Recruitment Platform

> 🚀 开源智能招聘系统（ATS）——以「候选人流转看板」为中枢、「AI Copilot」为差异化、「自动化工作流」贯穿全链路

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.19-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue)](#许可证)
[![Monorepo](https://img.shields.io/badge/Monorepo-npm%20workspaces-333333)](#目录结构)

## 功能矩阵

覆盖「职位 → 简历 → 面试 → Offer → 入职」招聘全流程，50+ 个核心功能：

### 核心业务模块

| 模块 | 功能亮点 |
|-----|--------|
| **职位管理** | JD AI 生成、自定义流程阶段、岗位评分卡模板、人才库唤醒 |
| **候选人 360°** | 简历导入/解析（文本/PDF）、语义标签、岗位匹配评分、完整操作时间轴 |
| **招聘看板** | Pipeline 拖拽、批量操作、AI 候选人对比、预筛三问 |
| **面试协同** | 面试安排、面试官时段 + 候选人自助选时、结构化面评（AI 草稿） |
| **Offer 与入职** | 审批流转、免登录 Offer 答复、入职清单、电子合同、入职机器人 |

### 运营智能化

| 能力 | 说明 |
|-----|------|
| 🤖 **AI Copilot** | JD 生成、简历解析、岗位评分、候选人对比、面评草稿、Offer 留存预测 |
| 📊 **数据大盘** | 招聘漏斗、AI 健康度诊断、多维洞察（TTH/渠道/面试官/毁约） |
| 🔐 **权限体系** | 按钮级权限 + 行级数据范围、可视化角色矩阵编辑 |
| 📋 **合规与审计** | 全实体操作留痕、可追溯的审计日志、符合 GDPR 友好的假删设计 |
| 🎯 **流程自动化** | 自动化通知、待办中心、入职问答机器人、离线门户 |

### 候选人免登录门户

凭 token 一键直达，无需注册：
- **Offer 答复**：查看 Offer、接受/拒绝、答复截止管理
- **入职资料**：清单进度、证件上传（OCR 自动识别）、电子合同签署
- **面试自助选时**：在面试官空闲时段中直接预约
- **预筛问卷**：在线回答期望薪资、到岗时间、出差意愿

## 🛠 技术栈

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (apps/web)                                         │
│ Vite 8 | React 19 | TypeScript | Ant Design 6              │
│ react-router 8 | TanStack Query | Zustand | dnd-kit         │
└─────────────────────────────────────────────────────────────┘
         ↓ API (http://localhost:3000)
┌─────────────────────────────────────────────────────────────┐
│ Backend (apps/api)                                          │
│ NestJS 11 | Prisma 7 | PostgreSQL 18 | JWT | Swagger Docs   │
└─────────────────────────────────────────────────────────────┘
         ↓ Shared (packages/shared)
         └─ Enums | Permissions | Constants (CJS + ESM)

🤖 AI Gateway: Anthropic SDK + Fallback Rule Engine
💾 Storage: MinIO (dev) | S3-compatible (prod)
🗄️ Database: PostgreSQL 18 | Redis
🐳 Infrastructure: Docker Compose
```

| 层 | 技术选型 | 说明 |
|----|--------|------|
| **前端** | React 19 + Vite | 快速开发、HMR、优化打包 |
| **UI 组件** | Ant Design 6 | 企业级组件库、主题定制 |
| **状态管理** | Zustand + TanStack Query | 轻量级、组合式的状态 + 服务端缓存 |
| **拖拽** | dnd-kit | 现代、无依赖的拖拽库 |
| **后端** | NestJS 11 | 模块化、装饰器、内置 RBAC 支持 |
| **ORM** | Prisma 7 | 类型安全、自动迁移、driver adapter 支持 |
| **AI** | Anthropic SDK | 结构化输出、多模型支持 |
| **降级方案** | 内置规则引擎 | API key 缺失/失败自动切换，无人工干预 |

## ⚡ 快速开始

### 前置条件
- Node.js ≥ 20.19
- Docker & Docker Compose
- npm 或 yarn

### 步骤 1：克隆并安装依赖

```bash
git clone https://github.com/suijiafeng/ai-powered-pecruitment-platform.git
cd ai-powered-pecruitment-platform
npm install
```

### 步骤 2：启动基础设施

```bash
docker compose up -d
# 启动 PostgreSQL 18 | Redis | MinIO
```

### 步骤 3：配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
# 编辑 .env，配置数据库连接等（默认已适配 docker compose）
```

### 步骤 4：初始化数据库

```bash
npm run db:migrate            # 执行迁移脚本
npm run db:generate           # 生成 Prisma Client
npm run db:seed               # 写入角色、权限、测试账号
```

### 步骤 5：启动开发服务

```bash
npm run dev
# 自动启动：
#   - shared 文件监听编译
#   - API 服务 → http://localhost:3000
#   - Web 服务 → http://localhost:5173
```

### 验证安装

| 服务 | 访问地址 | 说明 |
|-----|--------|------|
| **应用** | http://localhost:5173 | React 前端应用 |
| **API 文档** | http://localhost:3000/api/docs | Swagger 交互式文档 |
| **MinIO 控制台** | http://localhost:9001 | 对象存储管理（账号: minioadmin/minioadmin） |

### 测试账号

所有测试账号密码统一为 `Admin@123456`

| 账号 | 角色 | 数据权限 | 场景 |
|------|-----|--------|------|
| `admin@arthr.local` | 系统管理员 | 全部数据 | 系统配置、权限管理、部门管理 |
| `hr@arthr.local` | HR / 招聘专员 | 全部数据 | 职位发布、候选人管理、Offer 发送 |
| `manager@arthr.local` | 用人经理 | 本部门数据 | 查看部门候选人、审批 Offer |
| `interviewer@arthr.local` | 面试官 | 被指派的候选人 | 面试安排、面评反馈 |
| `it@arthr.local` | IT / 行政 | 被指派的任务 | 受限权限演示 |

💡 **提示**：第一次登录时，系统自动创建部门、职位、样本候选人

## 📁 目录结构

```
hireflow/
├── apps/
│   ├── api/                          # 📱 NestJS 后端
│   │   ├── src/modules/
│   │   │   ├── auth/                 # JWT 认证、登录
│   │   │   ├── rbac/                 # 权限体系（角色、权限码、PermissionsGuard）
│   │   │   ├── departments/          # 部门管理
│   │   │   ├── jobs/                 # 职位管理、JD AI 生成
│   │   │   ├── candidates/           # 候选人、简历导入、标签
│   │   │   ├── applications/         # 投递记录、岗位匹配评分
│   │   │   ├── interviews/           # 面试安排、面评、选时
│   │   │   ├── offers/               # Offer 管理、审批流
│   │   │   ├── onboarding/           # 入职清单、材料收集、电子合同
│   │   │   ├── helpdesk/             # 入职问答机器人
│   │   │   ├── notifications/        # 通知中心、待办
│   │   │   ├── analytics/            # 招聘漏斗、数据洞察、AI 诊断
│   │   │   ├── activity-log/         # 操作留痕、审计日志
│   │   │   ├── storage/              # MinIO / S3 文件上传
│   │   │   └── ai/                   # 🤖 AI 网关（Anthropic SDK + 规则引擎）
│   │   ├── .env.example              # 环境变量模板
│   │   └── prisma/schema.prisma      # 数据库 schema
│   │
│   └── web/                          # 🎨 React 前端
│       ├── src/pages/
│       │   ├── dashboard/            # 📊 数据大盘（漏斗 + 诊断）
│       │   ├── insights/             # 📈 数据洞察（多维分析）
│       │   ├── jobs/                 # 💼 职位管理
│       │   ├── candidates/           # 👥 候选人详情（360° profile）
│       │   ├── board/                # 📋 招聘看板（拖拽、批量）
│       │   ├── interviews/           # 🎤 面试协同
│       │   ├── offers/               # 📄 Offer 与录用
│       │   ├── onboarding/           # 🎉 入职管理
│       │   ├── helpdesk/             # 🤖 入职问答
│       │   ├── settings/             # ⚙️ 权限/角色/部门管理
│       │   └── portal/               # 🔓 免登录门户（4 页）
│       └── src/components/           # 共享组件库
│
├── packages/
│   └── shared/                       # 📦 前后端共享
│       ├── enums/                    # 状态码、职位级别等
│       ├── permissions/              # 权限码定义
│       ├── constants/                # 全局常量
│       └── types/                    # TypeScript 类型
│
├── deploy/                           # 🚀 部署文件
│   ├── nginx/                        # nginx 反代配置
│   └── api-entrypoint.sh             # Docker 容器启动脚本
│
├── docker-compose.yml                # 本地开发基础设施
├── Dockerfile                        # Web 应用镜像
├── Dockerfile.api                    # API 应用镜像
└── render.yaml                       # Render.com Blueprint（一键部署）
```

## 🤖 AI 能力

**统一 AI 网关** (`apps/api/src/modules/ai/`)：智能降级、完全可解释

### 核心特性
- ✅ **可降级**：未配置 API key 时自动切换内置规则引擎，全链路可用
- ✅ **可追溯**：每条 AI 输出都标注 `aiMeta.provider` 来源（Claude/Rule Engine）
- ✅ **可缓存**：`parseResume` / `scoreMatch` 按内容哈希缓存，避免重复调用
- ✅ **容错强**：调用失败自动降级，不阻断人工流程

### 启用大模型

在 `apps/api/.env` 配置，重启后生效：

```bash
ANTHROPIC_API_KEY="sk-ant-v7-..."
ANTHROPIC_MODEL="claude-opus-4-8"    # 精准度最高（推荐）
# ANTHROPIC_MODEL="claude-haiku-4-5" # 成本最优
```

### AI 功能速览

| 功能 | 应用场景 | 入口位置 |
|------|--------|--------|
| 🎯 JD 生成 | 职位信息快速补全 | 职位管理 → 新建 → AI 生成 JD |
| 📄 简历解析 | 结构化 + 标签 + 摘要 | 候选人详情 → 简历 Tab → AI 解析 |
| 📊 岗位匹配评分 | 可解释的匹配报告 | 候选人详情 → 应聘记录 → AI 评分 |
| 🔄 候选人对比 | 多人横向对比分析 | 招聘看板 → 勾选多人 → AI 对比 |
| ✍️ 面评草稿 | 按评分卡维度自动生成 | 提交面评 → AI Copilot → 生成草稿 |
| 📈 招聘诊断 | 漏斗瓶颈识别 + AI 建议 | 数据大盘 → 诊断卡片 |
| 🎁 人才库唤醒 | 历史简历匹配新职位 | 职位管理 → 人才库扫描 |
| 🎪 Offer 留存预测 | 风险预警气泡 | 录用管理 → Offer 列表 |

## 🚀 部署

### 本地 Docker 部署

```bash
# 1. 构建镜像
docker build -f Dockerfile.api -t hireflow-api:latest .
docker build -f Dockerfile -t hireflow-web:latest .

# 2. 使用 docker-compose 启动全栈
docker compose -f docker-compose.yml up -d

# 3. 执行数据库迁移（容器内）
docker exec <api-container-id> npm run db:migrate
docker exec <api-container-id> npm run db:seed
```

### 云平台一键部署

#### Render.com（推荐）
- **优点**：免费额度充足、自动 HTTPS、PostgreSQL 托管
- **步骤**：
  1. Fork 本仓库到你的 GitHub 账号
  2. 登录 [Render Dashboard](https://dashboard.render.com)
  3. 点击 **New** → **Blueprint** → 选择本仓库
  4. Render 自动创建 3 个服务：API | Web | Managed Postgres
  5. 配置环境变量（API_ORIGIN、S3 等）后自动部署

- **运行时注意**：
  - 免费实例 15 分钟无流量会休眠，仅公网请求可唤醒
  - `API_ORIGIN` 填 API 服务的公网 URL（nginx 反代已做协议转换）
  - 对象存储需单独配置 S3 兼容服务（如 Cloudflare R2）

### 环境变量配置

详见 [apps/api/.env.example](apps/api/.env.example)，关键变量：

```bash
# 数据库
DATABASE_URL="postgresql://user:pass@localhost:5432/hireflow"

# AI 能力
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-opus-4-8"

# 对象存储（S3 兼容）
S3_ENDPOINT="https://s3.us-west-1.amazonaws.com"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_BUCKET_NAME="hireflow-private"

# 应用
API_ORIGIN="http://localhost:3000"
FRONTEND_ORIGIN="http://localhost:5173"
JWT_SECRET="your-secret-key-here"
```

### Docker 镜像说明

| 镜像 | Dockerfile | 用途 |
|-----|-----------|------|
| `hireflow-api` | [Dockerfile.api](Dockerfile.api) | NestJS API 服务 |
| `hireflow-web` | [Dockerfile](Dockerfile) | React 前端应用（nginx 反代） |

> **为什么分开？** 因为 Render 目前不支持多阶段 Dockerfile 的 `--target`，所以两个文件分离维护。两者的依赖安装和编译逻辑完全一致，改动时需同步。

## 📐 设计原则

HireFlow 遵循以下核心设计理念，确保系统稳定、安全、可追溯：

### 1️⃣ 删除克制（Soft Delete）
- 候选人、投递、Offer、操作记录 **从不物理删除**（满足审计合规要求）
- 业务上的"删除"建模为状态终结：
  - 候选人 → `淘汰 + 原因码`
  - 投递 → `已撤回`
  - 职位 → `已关闭`
  - 面试 → `已取消`
- 完整的时间轴追踪，可追溯、可审计

### 2️⃣ 权限双保险
```
前端:  hasPermission() → 按钮显隐（体验层）
                ↓
后端:  PermissionsGuard → 请求校验（安全边界）
```
- 独立生效，前端隐藏 ≠ 安全验证
- 任何客户端都需通过后端权限检查

### 3️⃣ 数据范围与功能权限正交
- **功能权限**：能不能执行某个操作（如"发送 Offer"）
- **数据范围**：能看到哪些数据行（全部/本部门/仅被指派/仅本人）
- 两条独立轴线，都随 JWT 下发；多角色时数据范围取并集

### 4️⃣ AI 完全可降级、可解释
- 缺 API key → 自动降级到内置规则引擎（零人工干预）
- 调用失败 → 自动重试 + 降级（不阻断业务）
- 每条输出都标注来源：`aiMeta.provider = "claude"` 或 `"rule-engine"`
- 没有黑盒判断，所有决策可解释

### 5️⃣ 乐观锁而非悲观锁
- 高并发路径（看板拖拽、Offer 状态流转）使用 Prisma 的 `updateMany` + 状态前置条件
- 冲突返回 409，由前端提示用户重试（而非锁定等待）
- 降低数据库锁竞争，提升吞吐量

## 📊 功能完成度

| 阶段 | 功能 | 状态 |
|-----|------|------|
| **工程骨架** | Monorepo | RBAC | 看板拖拽 | 操作留痕 | ✅ |
| **一期 MVP** | 职位管理 | 候选人 360° | 面试协同 | 简历导入 | ✅ |
| **二期 AI 增强** | AI 网关 | JD 生成 | 简历解析 | 岗位评分 | 面评草稿 | ✅ |
| **三期 自动化** | Offer 审批 | 免登录答复 | 入职清单 | 电子合同 | 入职机器人 | ✅ |
| **V5 增强** | 批量操作 | 人才库唤醒 | 数据洞察 | 面试自助选时 | 评分卡 | AI 对比 | ✅ |
| **🚧 规划中** | 去偏见筛选 | Offer 到期邮件提醒 | 漏斗精确回放 | ⏳ |

## 🔓 免登录门户

候选人和新员工凭一次性 token 直达，无需注册账号

| 页面 | 路由 | 功能 | 触发时机 |
|------|------|------|---------|
| **Offer 答复** | `/portal/offer/:token` | 查看 Offer、接受/拒绝（支持原因码）、答复截止管理（5 工作日，可续期） | 发送 Offer 时 |
| **入职资料** | `/portal/onboarding/:token` | 清单进度、证件上传（OCR 自动识别）、电子合同签署 | Offer 已接受 |
| **面试自助选时** | `/portal/interview/:token` | 在面试官维护的空闲时段中直接预约 | 面试安排待选时 |
| **预筛问卷** | `/portal/prescreen/:token` | 在线回答期望薪资、到岗时间、出差意愿；HR 收到风险旗标但不自动淘汰 | 发起预筛时 |

## 📈 性能优化

### 前端优化
- **虚拟滚动**：大列表使用 react-window（候选人列表 1000+ 条秒开）
- **查询缓存**：TanStack Query 自动缓存 & 智能更新（避免重复请求）
- **代码分割**：Vite 按路由分割，初始加载 < 300KB
- **图片优化**：所有头像支持 WebP + 懒加载

### 后端优化
- **数据库索引**：关键查询列已索引（candidates.created_at / department_id / status）
- **N+1 查询防护**：Prisma `include` + 数据加载器模式
- **缓存策略**：
  - AI 结果按内容哈希缓存（同一份简历不重复调用 API）
  - Redis 缓存权限矩阵、部门树（刷新时实时更新）
- **并发控制**：乐观锁替代悲观锁，减少锁竞争

### 基础设施
- **CDN**：静态资源（CSS / JS）通过 CDN 分发
- **gzip 压缩**：API 响应自动压缩（文本减 80%）
- **连接池**：PostgreSQL 连接池大小 20（开发环境）

## 🤝 贡献指南

我们欢迎所有形式的贡献！无论是功能、bug 修复、文档还是翻译。

### 开发流程

1. **Fork & Clone**
   ```bash
   git clone https://github.com/suijiafeng/ai-powered-pecruitment-platform.git
   cd ai-powered-pecruitment-platform
   npm install
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feat/your-feature-name
   # 或 fix/issue-number
   ```

3. **提交代码**
   ```bash
   npm run format                # 格式化代码
   git commit -m "feat: add xxx"  # 遵循 Conventional Commits
   git push origin feat/your-feature-name
   ```

4. **提交 Pull Request**
   - 描述改动内容、为什么做这个改动
   - 关联相关的 Issue（如果有）
   - 等待 Code Review

### 代码规范

- **TypeScript**：严格模式（noImplicitAny / strict）
- **命名**：驼峰式（变量/函数）、PascalCase（类/组件）
- **格式化**：运行 `npm run format` 来自动修复
- **注释**：仅在 WHY 不明显时添加；WHAT 应由代码自说明

### 测试要求

- 功能模块应包含单元测试（Jest）
- 集成测试覆盖核心业务流程
- 提交 PR 前运行 `npm run test`（如适用）

### 报告 Bug

如发现 bug，请通过 [Issues](https://github.com/suijiafeng/ai-powered-pecruitment-platform.issues) 报告，包含：
- 复现步骤
- 预期行为 vs 实际行为
- 环境信息（Node 版本、浏览器等）
- 错误日志（如有）

## 📚 文档与资源

| 资源 | 链接 |
|-----|------|
| **API 文档** | http://localhost:3000/api/docs (Swagger) |
| **数据库 Schema** | [prisma/schema.prisma](apps/api/prisma/schema.prisma) |
| **环境变量** | [apps/api/.env.example](apps/api/.env.example) |
| **部署配置** | [render.yaml](render.yaml) |
| **业务流程图** | 📋 见 Wiki（待补充） |

## ❓ 常见问题

### Q: 为什么需要配置 AI API key？
A: AI 功能（如 JD 生成、简历解析）需要调用 Anthropic API。不配置也能使用，系统会自动切换到内置规则引擎（功能有限，但不阻断）。

### Q: MinIO 存储的文件怎么备份？
A: MinIO 支持 S3 兼容的备份工具。生产环境建议使用云对象存储（AWS S3 / Cloudflare R2）。

### Q: 如何在生产环境中部署？
A: 参考 [render.yaml](render.yaml) 一键部署，或使用 Docker 自行部署到任何支持容器的平台（AWS ECS / Kubernetes / DigitalOcean 等）。

### Q: 简历解析支持哪些格式？
A: 支持 PDF、Word (.docx)、纯文本；上传时自动识别。

### Q: 如何修改招聘流程阶段？
A: 系统管理员可在「设置 → 部门管理」中自定义各部门的招聘流程（如：初审 → 笔试 → 面试 → Offer），不同部门可配置不同阶段。

### Q: 权限体系如何工作？
A: 系统预置 5 种角色（系统管理员 / HR / 用人经理 / 面试官 / 其他），可视化编辑每个角色的功能权限和数据范围。用户的实际权限是所有角色的并集。
