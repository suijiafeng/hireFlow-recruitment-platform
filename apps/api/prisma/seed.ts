/**
 * 种子数据：幂等可重复执行。
 * 角色/权限/部门/内部账号始终 upsert 对齐。
 */
import 'dotenv/config';
import { hashSync } from 'bcryptjs';
import {
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
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: def.name, dataScope: def.dataScope },
      update: { name: def.name, dataScope: def.dataScope },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...def.permissions] } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
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
          action: 'application.created',
          entityType: 'Application',
          entityId: application.id,
          payload: { candidate: c.name, job: job.title, stage: stage.name },
        },
      });
    }
  };

  await seedApplications(backendJob, backendCandidates);
  await seedApplications(productJob, productCandidates);

  console.log(
    `✔ 示例数据：2 个职位 / ${backendCandidates.length + productCandidates.length} 名候选人`,
  );
}

async function main() {
  await seedRbac();
  const { tech, product } = await seedDepartmentsAndUsers();
  await seedDemoData(tech.id, product.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
