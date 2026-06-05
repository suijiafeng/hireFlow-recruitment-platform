import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';

const DEPARTMENT_INCLUDE = { _count: { select: { users: true, jobs: true, children: true } } } as const;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  list() {
    return this.prisma.department.findMany({ include: DEPARTMENT_INCLUDE, orderBy: { name: 'asc' } });
  }

  async create(data: { name: string; parentId?: string }, user: JwtUser) {
    const department = await this.prisma.department.create({ data, include: DEPARTMENT_INCLUDE });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.DEPARTMENT_CREATED, 'Department', department.id, {
      name: department.name,
    });
    return department;
  }

  async update(id: string, data: { name?: string }, user: JwtUser) {
    const exists = await this.prisma.department.findUnique({ where: { id }, select: { name: true } });
    if (!exists) throw new NotFoundException('部门不存在');
    const department = await this.prisma.department.update({ where: { id }, data, include: DEPARTMENT_INCLUDE });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.DEPARTMENT_UPDATED, 'Department', id, {
      before: exists.name,
      after: department.name,
    });
    return department;
  }

  /**
   * 删空才能删：职位/成员/子部门任一非空即拒绝，给出具体原因而非裸抛数据库外键错误。
   * 种子数据按部门名匹配（非稳定 id），改名后重新执行 seed 会视为新部门，不会回填到改名后的记录。
   */
  async remove(id: string, user: JwtUser) {
    const department = await this.prisma.department.findUnique({ where: { id }, include: DEPARTMENT_INCLUDE });
    if (!department) throw new NotFoundException('部门不存在');
    const { jobs, users, children } = department._count;
    if (jobs > 0 || users > 0 || children > 0) {
      const blockers = [
        jobs > 0 && `${jobs} 个职位`,
        users > 0 && `${users} 名成员`,
        children > 0 && `${children} 个子部门`,
      ].filter(Boolean);
      throw new BadRequestException(`部门下还有 ${blockers.join('、')}，需先清空或转移后才能删除`);
    }
    await this.prisma.department.delete({ where: { id } });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.DEPARTMENT_DELETED, 'Department', id, {
      name: department.name,
    });
  }
}
