# ART 智能招聘 · HireFlow

开源智能招聘系统（ATS）：以「候选人流转看板」为中枢、「AI Copilot」为差异化、「自动化工作流」贯穿录用入职。

## 功能总览

覆盖「职位 → 简历 → 面试 → Offer → 入职」招聘全流程：

- **职位管理**：JD 生成（AI）、自定义招聘流程阶段、岗位评分卡模板、人才库唤醒
- **候选人 360°**：简历导入与解析（文本/PDF）、语义标签与摘要、岗位匹配度评分、完整操作时间轴
- **招聘看板**：Pipeline 拖拽流转、批量移动/淘汰、AI 候选人对比、预筛三问
- **面试协同**：面试安排与取消、面试官时段与候选人自助选时、结构化评分卡面评（AI 草稿）
- **Offer 与入职**：审批流（用人经理审批/驳回重提）、免登录 Offer 答复、入职清单与材料收集（证件照片低置信度人工核对）、电子合同、入职问答机器人（制度知识库）
- **数据与合规**：数据大盘（漏斗 + AI 健康度诊断）、数据洞察（TTH/渠道/面试官/毁约/阶段停留）、全实体操作留痕与审计日志
- **权限体系**：按钮级功能点权限 + 数据行级范围（全部/本部门/仅被指派/仅本人），设置页可视化编辑角色权限矩阵与成员角色分配
- **系统管理**：部门管理（改名、删空才能删）、制度文档管理（入职问答机器人知识库的维护入口）
- **免登录门户**：Offer 答复 / 入职资料填报 / 面试自助选时 / 预筛三问，候选人凭 token 链接直达，无需注册

## 技术栈

| 端 | 栈 |
|---|---|
| 前端 `apps/web` | Vite 8 + React 19 + TypeScript + Ant Design 6 + react-router 8 + TanStack Query + zustand + dnd-kit |
| 后端 `apps/api` | NestJS 11 + Prisma 7（driver adapter）+ PostgreSQL 18 + JWT + Swagger |
| 共享 `packages/shared` | 枚举 / 权限码 / 角色默认权限 / 常量（CJS + ESM 双产物） |
| 对象存储 | MinIO（开发）/ 任意 S3 兼容服务（生产），私有桶 + 预签名 URL |
| AI | Anthropic SDK（结构化输出）+ 内置规则引擎双引擎，失败自动降级 |
| 基础设施 | Docker Compose：PostgreSQL / Redis / MinIO |

## 快速开始

前置：Node ≥ 20.19、Docker。

```bash
npm install
docker compose up -d          # postgres / redis / minio
cp apps/api/.env.example apps/api/.env

npm run db:migrate            # 应用数据库迁移
npm run db:generate           # 生成 Prisma Client 到 apps/api/src/generated
npm run db:seed               # 写入角色/权限/测试账号
npm run dev                   # shared 监听编译 + api(:3000) + web(:5173)
```

打开 http://localhost:5173 ，接口文档在 http://localhost:3000/api/docs 。

### 测试账号（密码统一 `Admin@123456`）

| 账号 | 角色 | 数据范围 |
|---|---|---|
| admin@arthr.local | 系统管理员 | 全部 |
| hr@arthr.local | HR / 招聘专员 | 全部 |
| manager@arthr.local | 用人经理 | 本部门 |
| interviewer@arthr.local | 面试官 | 仅被指派 |
| it@arthr.local | IT / 行政 | 仅被指派 |

## 目录结构

```
apps/api        NestJS 后端（modules: auth/users/rbac/departments/jobs/candidates/
                applications/interviews/offers/onboarding/helpdesk/notifications/
                analytics/activity-log/storage/ai）
apps/web        React 前端（pages: 数据大盘/数据洞察/职位/候选人/招聘看板/面试/
                录用/入职/入职问答/设置 + portal 免登录门户 4 页）
packages/shared 前后端共享枚举 / 权限码 / 角色默认权限 / 常量
deploy          nginx 反代模板 + api 容器入口脚本
```

## AI 能力

统一 AI 网关（`apps/api/src/modules/ai/`）：**未配置 key 时用内置规则引擎兜底，全链路可用**；配置后自动切换大模型，调用失败自动降级不阻断人工流程。所有 AI 输出附带 `aiMeta.provider` 来源标记（可解释、可追溯）；`parseResume`/`scoreMatch` 结果按内容哈希缓存（AiCache）。

```bash
# apps/api/.env 配置后重启即启用大模型
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-opus-4-8"   # 成本敏感可换 claude-haiku-4-5
```

| 能力 | 入口 |
|---|---|
| JD 生成 | 职位管理 → 新建职位 → AI 生成 JD |
| 简历解析（结构化 + 语义标签 + 摘要） | 候选人详情 → 简历 → AI 解析 |
| 岗位匹配度评分（可解释报告） | 候选人详情 → 应聘记录 → AI 评分 |
| 候选人横向对比 | 招聘看板 → 勾选多人 → AI 对比 |
| 面评草稿（按评分卡维度） | 提交面评 → AI Copilot → 生成草稿 |
| 招聘漏斗 + AI 健康度诊断 | 数据大盘 |
| 人才库唤醒（沉睡简历匹配新岗位） | 职位管理 → 人才库扫描 |
| Offer 留存预测 | 录用管理 → Offer 列表 → 留存预测气泡 |

## 部署

推荐部署到 [Render](https://render.com)：仓库根目录带 [render.yaml](render.yaml) Blueprint（Managed Postgres + API + Web 三服务），控制台 New → Blueprint 选择本仓库即可自动建齐。免费档实例休眠后仅公网流量可唤醒，`API_ORIGIN` 填 API 服务公网 URL（nginx 反代已做协议归一化，私网/公网地址都能用）。对象存储需另配 S3 兼容服务（如 Cloudflare R2），环境变量见 [apps/api/.env.example](apps/api/.env.example)。

API 用 [Dockerfile.api](Dockerfile.api)，Web 用根目录 [Dockerfile](Dockerfile)（两个文件分开，是因为 Render 目前不支持给多阶段 Dockerfile 指定 target——两者的 deps/build 层完全一致，改动时需同步维护）。

## 设计原则

- **删除克制**：候选人、投递、Offer、操作留痕均不做物理删除（合规审计要求）。业务上的"删除"一律建模为状态终结——候选人淘汰、投递撤回、职位关闭、面试取消——附带原因码，完整留痕于时间轴，可追溯、可审计。
- **权限双保险**：前端用 `hasPermission()` 控制按钮显隐（体验层面），后端 `PermissionsGuard` 二次校验（安全边界），二者独立生效，前端隐藏不能替代后端校验。
- **数据范围与功能权限正交**：功能点权限（能不能做某件事）与数据范围（能看到哪些数据行）是两条独立的轴，共同随 JWT 下发；身兼多角色时数据范围取其中最宽者。
- **AI 可降级、可解释**：AI 网关缺 key 或调用失败时自动切换规则引擎兜底，全链路仍可用；每条 AI 输出都带 `aiMeta.provider` 标记来源，不做黑盒判断。
- **乐观锁而非悲观锁**：看板拖拽、Offer 状态流转等高并发写路径用 `updateMany` 加状态前置条件，冲突时返回 409 由前端提示重试，而非行级锁阻塞。

## 实施进度

- [x] 工程骨架：monorepo、RBAC（按钮级权限 + 数据范围建模）、Pipeline 看板拖拽、操作留痕、全量 schema
- [x] 一期 MVP：职位管理、候选人 360° 详情页、面试安排与面评、简历导入、基础权限
- [x] 二期 AI 增强：AI 网关（可插拔 + 自动降级）、JD 生成、简历解析/打分/标签/摘要、面评草稿、数据大盘漏斗与 AI 诊断
- [x] 三期 自动化与入职：Offer 审批流与免登录答复、入职清单/电子合同/材料收集（MinIO/S3 + 低置信度人工核对）、入职问答机器人、通知中心、待办中心
- [x] V5 增强：看板批量操作、人才库唤醒、数据洞察报表、面试官时段与候选人自助选时、岗位评分卡模板、AI 候选人对比、预筛三问、AI 结果缓存、角色权限可视化编辑、部门与制度文档管理
- [ ] 待办：完整去偏见筛选、Offer 到期前邮件提醒（需邮件通道 + 调度器）、精确漏斗口径（ActivityLog 回放）

## 免登录门户（候选人 / 新员工）

Offer 发送、面试待选时、预筛问卷发出后自动生成一次性链接（token 即凭证，无需注册）：

- `/portal/offer/:token` 候选人查看 Offer、接受或带原因码拒绝；答复截止 5 个工作日（懒过期，可续期一次）
- `/portal/onboarding/:token` 新员工查看入职清单进度、粘贴证件文本/拍照上传自动 OCR 归档、签署电子合同
- `/portal/interview/:token` 候选人在面试官维护的空闲时段中自助选时
- `/portal/prescreen/:token` 候选人在线填答预筛三问（期望薪资/到岗时间/出差意愿），HR 收到风险旗标提醒但不自动淘汰
