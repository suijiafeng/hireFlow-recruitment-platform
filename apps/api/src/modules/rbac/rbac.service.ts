import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS, RoleCode } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';

const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} as const;

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * 全量替换角色的功能点权限。
   * 权限随 JWT 下发，调整后相关用户需重新登录方可生效。
   */
  async updateRolePermissions(roleId: string, codes: string[], actor: JwtUser) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('角色不存在');
    // 管理员角色锁定全量权限：防止误操作把唯一能改权限的角色改瘸，重启后 seed 也会强制对齐
    if (role.code === RoleCode.ADMIN) {
      throw new ForbiddenException('系统管理员角色始终拥有全部权限，不可编辑');
    }

    const unique = [...new Set(codes)];
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: unique } } });
    if (permissions.length !== unique.length) {
      const known = new Set(permissions.map((p) => p.code));
      throw new BadRequestException(`未知权限码：${unique.filter((c) => !known.has(c)).join('、')}`);
    }

    const before = role.permissions.map((rp) => rp.permission.code).sort();
    const after = [...unique].sort();

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
      await this.activityLog.record(
        actor,
        ACTIVITY_ACTIONS.ROLE_PERMISSIONS_UPDATED,
        'Role',
        roleId,
        { roleCode: role.code, roleName: role.name, before, after },
        tx,
      );
    });

    return this.prisma.role.findUnique({ where: { id: roleId }, include: ROLE_INCLUDE });
  }
}
