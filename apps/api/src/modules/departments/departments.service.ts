import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEPARTMENT_INCLUDE = { _count: { select: { users: true, jobs: true, children: true } } } as const;

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.department.findMany({ include: DEPARTMENT_INCLUDE, orderBy: { name: 'asc' } });
  }

  create(data: { name: string; parentId?: string }) {
    return this.prisma.department.create({ data, include: DEPARTMENT_INCLUDE });
  }

  async update(id: string, data: { name?: string }) {
    const exists = await this.prisma.department.count({ where: { id } });
    if (exists === 0) throw new NotFoundException('部门不存在');
    return this.prisma.department.update({ where: { id }, data, include: DEPARTMENT_INCLUDE });
  }

  /**
   * 删空才能删：职位/成员/子部门任一非空即拒绝，给出具体原因而非裸抛数据库外键错误。
   * 种子数据按部门名匹配（非稳定 id），改名后重新执行 seed 会视为新部门，不会回填到改名后的记录。
   */
  async remove(id: string) {
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
  }
}
