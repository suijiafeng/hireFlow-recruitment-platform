import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS, RoleCode } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  department: { select: { id: true, name: true } },
  roles: { select: { role: { select: { code: true, name: true } } } },
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /** 内部用户列表（设置页/面试官选择器用） */
  async list(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { roles: { some: { role: { code: role } } } } : undefined,
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 全量替换用户的角色。
   * 角色与数据范围随 JWT 下发（多角色取最宽 dataScope），调整后需重新登录生效。
   */
  async updateRoles(userId: string, roleCodes: string[], actor: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const unique = [...new Set(roleCodes)];
    const roles = await this.prisma.role.findMany({ where: { code: { in: unique } } });
    if (roles.length !== unique.length) {
      const known = new Set(roles.map((r) => r.code));
      throw new BadRequestException(`未知角色码：${unique.filter((c) => !known.has(c)).join('、')}`);
    }

    // 防锁死：撤掉某人的 ADMIN 前，确认系统里还有其他在用的管理员
    const hadAdmin = user.roles.some((ur) => ur.role.code === RoleCode.ADMIN);
    const keepsAdmin = unique.includes(RoleCode.ADMIN);
    if (hadAdmin && !keepsAdmin) {
      const otherAdmins = await this.prisma.user.count({
        where: {
          id: { not: userId },
          status: 'ACTIVE',
          roles: { some: { role: { code: RoleCode.ADMIN } } },
        },
      });
      if (otherAdmins === 0) {
        throw new ForbiddenException('系统需至少保留一名系统管理员');
      }
    }

    const before = user.roles.map((ur) => ur.role.code).sort();
    const after = [...unique].sort();

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId, roleId: r.id })),
      });
      await this.activityLog.record(
        actor,
        ACTIVITY_ACTIONS.USER_ROLES_UPDATED,
        'User',
        userId,
        { userName: user.name, before, after },
        tx,
      );
    });

    return this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  }
}
