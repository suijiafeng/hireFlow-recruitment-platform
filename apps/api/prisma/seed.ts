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

async function seedDemoJobs(techDeptId: string, productDeptId: string) {
  if ((await prisma.job.count()) > 0) {
    console.log('… 已存在职位数据，跳过示例职位');
    return;
  }

  const hr = await prisma.user.findUniqueOrThrow({ where: { email: 'hr@arthr.local' } });
  const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@arthr.local' } });

  await prisma.job.create({
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
  });

  await prisma.job.create({
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
  });

  console.log('✔ 示例职位：后端工程师 / 产品经理（B端）');
}

async function main() {
  await seedRbac();
  const { tech, product } = await seedDepartmentsAndUsers();
  await seedDemoJobs(tech.id, product.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
