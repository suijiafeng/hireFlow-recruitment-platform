/**
 * 种子数据：幂等可重复执行。
 * 角色/权限/部门/内部账号始终 upsert 对齐。
 */
import 'dotenv/config';
import { hashSync } from 'bcryptjs';
import {
  ACTIVITY_ACTIONS,
  DEFAULT_PIPELINE_STAGES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFS,
  RoleCode,
} from '@hireflow/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEV_PASSWORD = 'Admin@123456';

async function seedRbac() {
  for (const def of PERMISSION_DEFS) {
    await prisma.permission.upsert({
      where: { code: def.code },
      create: def,
      update: { name: def.name, group: def.group },
    });
  }

  for (const [code, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const existed = await prisma.role.findUnique({ where: { code } });
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: def.name, dataScope: def.dataScope },
      update: { name: def.name, dataScope: def.dataScope },
    });
    // ADMIN 始终全量对齐（新增权限点自动补上，设置页也锁定不可编辑）；
    // 其余角色仅首次创建时写入默认值，此后不再覆盖——设置页的自定义权限要在重启/重部署后存活
    if (!existed && code !== RoleCode.ADMIN) {
      const permissions = await prisma.permission.findMany({
        where: { code: { in: [...def.permissions] } },
      });
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
    if (code === RoleCode.ADMIN) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      const permissions = await prisma.permission.findMany({
        where: { code: { in: [...def.permissions] } },
      });
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
  }
  console.log(`✔ RBAC：${PERMISSION_DEFS.length} 个权限点 / ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length} 个角色`);
}

async function seedDepartmentsAndUsers() {
  const tech = await upsertDepartment('技术部');
  const product = await upsertDepartment('产品部');

  const passwordHash = hashSync(DEV_PASSWORD, 10);
  const users: Array<{ email: string; name: string; role: RoleCode; departmentId?: string }> = [
    { email: 'admin@arthr.local', name: '系统管理员', role: RoleCode.ADMIN },
    { email: 'hr@arthr.local', name: '何欣（HR）', role: RoleCode.HR },
    { email: 'manager@arthr.local', name: '林涛（技术总监）', role: RoleCode.HIRING_MANAGER, departmentId: tech.id },
    { email: 'interviewer@arthr.local', name: '苏晴（资深工程师）', role: RoleCode.INTERVIEWER, departmentId: tech.id },
    { email: 'it@arthr.local', name: '陈明（IT 支持）', role: RoleCode.IT_SUPPORT },
  ];

  for (const u of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, passwordHash, departmentId: u.departmentId },
      update: { name: u.name, departmentId: u.departmentId },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }
  console.log(`✔ 部门与账号：${users.length} 个测试账号（密码 ${DEV_PASSWORD}）`);
  return { tech, product };
}

async function upsertDepartment(name: string) {
  const found = await prisma.department.findFirst({ where: { name } });
  return found ?? prisma.department.create({ data: { name } });
}

interface DemoCandidate {
  name: string;
  email: string;
  phone: string;
  source: string;
  tags: string[];
  matchScore: number;
  stage: string;
}

async function seedDemoData(techDeptId: string, productDeptId: string) {
  if ((await prisma.job.count()) > 0) {
    console.log('… 已存在职位数据，跳过示例数据');
    return;
  }

  const hr = await prisma.user.findUniqueOrThrow({ where: { email: 'hr@arthr.local' } });
  const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@arthr.local' } });

  const backendJob = await prisma.job.create({
    data: {
      title: '后端工程师',
      description:
        '负责智能招聘平台核心服务研发：Pipeline 流转引擎、RBAC 权限体系、自动化工作流。技术栈 NestJS + PostgreSQL + Redis。',
      requirement: '3 年以上后端经验；熟悉 Node.js/TypeScript；有 B 端系统或高并发经验者优先。',
      headcount: 2,
      status: 'OPEN',
      departmentId: techDeptId,
      hiringManagerId: manager.id,
      createdById: hr.id,
      stages: { create: DEFAULT_PIPELINE_STAGES.map((name, index) => ({ name, order: index })) },
    },
    include: { stages: true },
  });

  const productJob = await prisma.job.create({
    data: {
      title: '产品经理（B端）',
      description: '负责 ATS 产品规划与需求落地，深度参与 AI 招聘场景设计。',
      requirement: '3 年以上 B 端产品经验，有 HR SaaS 背景优先。',
      headcount: 1,
      status: 'OPEN',
      departmentId: productDeptId,
      createdById: hr.id,
      stages: { create: DEFAULT_PIPELINE_STAGES.map((name, index) => ({ name, order: index })) },
    },
    include: { stages: true },
  });

  const stageByName = (jobStages: { id: string; name: string }[], name: string) =>
    jobStages.find((s) => s.name === name)!;

  const backendCandidates: DemoCandidate[] = [
    { name: '张伟', email: 'zhangwei@example.com', phone: '13800000001', source: 'BOSS直聘', tags: ['React', 'TypeScript', 'Node.js'], matchScore: 92, stage: '二面' },
    { name: '李娜', email: 'lina@example.com', phone: '13800000002', source: '猎聘', tags: ['NestJS', 'PostgreSQL', '微服务'], matchScore: 88, stage: '一面' },
    { name: '王强', email: 'wangqiang@example.com', phone: '13800000003', source: '内推', tags: ['Java', 'Spring', '高并发'], matchScore: 85, stage: '一面' },
    { name: '赵敏', email: 'zhaomin@example.com', phone: '13800000004', source: '拉勾', tags: ['Go', 'Kubernetes', '微服务'], matchScore: 81, stage: '简历初筛' },
    { name: '刘洋', email: 'liuyang@example.com', phone: '13800000005', source: 'BOSS直聘', tags: ['Python', '数据工程'], matchScore: 74, stage: '简历初筛' },
    { name: '陈静', email: 'chenjing@example.com', phone: '13800000006', source: '官网投递', tags: ['Node.js', 'React', '全栈'], matchScore: 79, stage: '简历初筛' },
    { name: '杨帆', email: 'yangfan@example.com', phone: '13800000007', source: '猎头推荐', tags: ['Java', '分布式', '带团队'], matchScore: 90, stage: 'Offer' },
    { name: '周杰', email: 'zhoujie@example.com', phone: '13800000008', source: '人才库唤醒', tags: ['Vue', '小程序'], matchScore: 68, stage: '待入职' },
  ];
  const productCandidates: DemoCandidate[] = [
    { name: '吴悠', email: 'wuyou@example.com', phone: '13800000011', source: 'BOSS直聘', tags: ['B端产品', '数据分析'], matchScore: 86, stage: '一面' },
    { name: '郑好', email: 'zhenghao@example.com', phone: '13800000012', source: '猎聘', tags: ['产品设计', '用户研究'], matchScore: 77, stage: '简历初筛' },
  ];

  const seedApplications = async (job: typeof backendJob, candidates: DemoCandidate[]) => {
    let position = 0;
    for (const c of candidates) {
      const candidate = await prisma.candidate.create({
        data: {
          name: c.name,
          email: c.email,
          phone: c.phone,
          source: c.source,
          tags: c.tags,
          resumes: {
            create: {
              fileName: `${c.name}-简历.pdf`,
              parseStatus: 'DONE',
              skills: c.tags,
              parsed: {
                summary: `${c.tags.join('/')} 方向候选人，示例解析结果`,
                educations: [{ school: '示例大学', degree: '本科' }],
                experiences: [{ company: '示例科技', title: '工程师', years: 3 }],
              },
            },
          },
        },
      });
      const stage = stageByName(job.stages, c.stage);
      const application = await prisma.application.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          stageId: stage.id,
          matchScore: c.matchScore,
          position: ++position,
        },
      });
      await prisma.activityLog.create({
        data: {
          actorId: hr.id,
          actorName: hr.name,
          action: ACTIVITY_ACTIONS.APPLICATION_CREATED,
          entityType: 'Application',
          entityId: application.id,
          payload: { candidate: c.name, job: job.title, stage: stage.name },
        },
      });
    }
  };

  await seedApplications(backendJob, backendCandidates);
  await seedApplications(productJob, productCandidates);

  // 李娜：明天 14:00 一面；张伟：补一场已完成的一面与面评
  const interviewer = await prisma.user.findUniqueOrThrow({
    where: { email: 'interviewer@arthr.local' },
  });
  const lina = await prisma.application.findFirstOrThrow({
    where: { job: { id: backendJob.id }, candidate: { name: '李娜' } },
  });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);
  await prisma.interview.create({
    data: {
      applicationId: lina.id,
      round: 1,
      scheduledAt: tomorrow,
      durationMins: 60,
      interviewers: { create: [{ userId: interviewer.id }] },
    },
  });

  const zhangwei = await prisma.application.findFirstOrThrow({
    where: { job: { id: backendJob.id }, candidate: { name: '张伟' } },
  });
  const doneInterview = await prisma.interview.create({
    data: {
      applicationId: zhangwei.id,
      round: 1,
      scheduledAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      durationMins: 60,
      status: 'COMPLETED',
      interviewers: { create: [{ userId: interviewer.id }] },
    },
  });
  await prisma.evaluation.create({
    data: {
      interviewId: doneInterview.id,
      interviewerId: interviewer.id,
      conclusion: 'YES',
      comments: '工程基础扎实，React 生态经验丰富，沟通清晰，建议进入二面。',
      submittedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      scorecard: [
        { dimension: '技术能力', score: 4, comment: '框架原理理解到位' },
        { dimension: '工程素养', score: 4, comment: '重视测试与代码规范' },
        { dimension: '沟通协作', score: 5, comment: '表达结构化' },
      ],
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: interviewer.id,
      actorName: interviewer.name,
      action: ACTIVITY_ACTIONS.EVALUATION_SUBMITTED,
      entityType: 'Application',
      entityId: zhangwei.id,
      payload: { candidate: '张伟', round: 1, conclusion: 'YES' },
    },
  });

  console.log(
    `✔ 示例数据：2 个职位 / ${backendCandidates.length + productCandidates.length} 名候选人 / 2 场面试`,
  );
}

async function seedCompanyDocs() {
  const docs = [
    {
      title: '办公网络与 WiFi 使用规定',
      tags: ['WiFi', '网络', '密码'],
      content:
        '办公区 WiFi：员工网络 SSID 为 ART-Staff，密码为 art@2026!，每季度更换一次并由 IT 邮件通知；访客网络 SSID 为 ART-Guest，密码 guest2026。严禁将员工网络密码告知外部人员。VPN 远程接入请在 IT 服务台提交申请，审批通过后 1 个工作日内开通。',
    },
    {
      title: '五险一金缴纳说明',
      tags: ['公积金', '社保', '五险一金'],
      content:
        '公司按国家与本市规定为员工缴纳五险一金。住房公积金缴存比例为个人 12% + 公司 12%，以上月应发工资为基数；社保（养老/医疗/失业/工伤/生育）按本市最新基数标准执行。入职当月 15 日前报到的员工当月起缴，15 日后次月起缴。公积金账户转移请联系 HR 何欣。',
    },
    {
      title: '休假制度（年假/病假/事假）',
      tags: ['年假', '请假', '病假', '事假', '调休'],
      content:
        '年假：入职满 1 年 5 天，满 3 年 10 天，满 10 年 15 天，按自然年折算，当年未休完可顺延至次年 3 月底。病假：需提供医院证明，全年累计 10 天内全薪。事假：无薪，需提前 1 天在 OA 申请。申请路径：OA → 假勤 → 请假申请，直属上级审批，3 天以上需部门负责人审批。',
    },
    {
      title: '差旅与报销制度',
      tags: ['报销', '差旅', '发票'],
      content:
        '报销周期：每月 1-5 日提交上月单据，财务 15 日前打款。交通：市内打车凭发票实报，异地差旅高铁二等座/经济舱。住宿标准：一线城市 500 元/晚，其他城市 350 元/晚。餐补：出差期间 100 元/天。所有报销需在 OA 上传发票照片并由直属上级审批。',
    },
    {
      title: '试用期与转正规定',
      tags: ['试用期', '转正', '考核'],
      content:
        '试用期一般为 3 个月，表现优秀者可申请提前转正（最早满 1 个月）。试用期工资为转正工资的 100%（不打折）。转正流程：试用期满前 2 周，员工在 OA 提交转正述职，直属上级与 HRBP 评估，用人部门负责人审批。试用期内双方均可提前 3 天通知解除劳动关系。',
    },
    {
      title: '考勤与办公时间',
      tags: ['考勤', '打卡', '办公时间', '远程'],
      content:
        '标准工作时间为周一至周五 10:00-19:00（含 1 小时午休），弹性打卡区间 9:00-10:30。每周三为无会议日。每月可申请 4 天远程办公，需提前 1 天报备直属上级。缺卡每月可补 3 次，在 OA → 假勤 → 补卡申请中提交。',
    },
  ];
  for (const doc of docs) {
    const existing = await prisma.companyDoc.findFirst({ where: { title: doc.title } });
    if (existing) {
      await prisma.companyDoc.update({ where: { id: existing.id }, data: doc });
    } else {
      await prisma.companyDoc.create({ data: doc });
    }
  }
  console.log(`✔ 制度文档：${docs.length} 篇（入职问答机器人知识库）`);
}

async function main() {
  await seedRbac();
  const { tech, product } = await seedDepartmentsAndUsers();
  await seedCompanyDocs();
  await seedDemoData(tech.id, product.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
