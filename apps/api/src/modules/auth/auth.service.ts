import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { widestScope } from '../../common/data-scope';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        department: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号不存在或已停用');
    }
    const passwordOk = await compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = this.flattenPermissions(user.roles);

    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
      departmentId: user.departmentId,
      dataScope: widestScope(user.roles.map((ur) => ur.role.dataScope)),
    };

    return {
      accessToken: await this.jwtService.signAsync({ ...payload }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions,
        department: user.department ? { id: user.department.id, name: user.department.name } : null,
      },
    };
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        department: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
      roles: user.roles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
        dataScope: ur.role.dataScope,
      })),
      permissions: this.flattenPermissions(user.roles),
    };
  }

  private flattenPermissions(
    roles: Array<{ role: { permissions: Array<{ permission: { code: string } }> } }>,
  ): string[] {
    return [...new Set(roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)))];
  }
}
