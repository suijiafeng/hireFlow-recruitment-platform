import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('rbac')
@ApiBearerAuth()
@Controller()
export class RbacController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('roles')
  @ApiOperation({ summary: '角色列表（含权限点）' })
  roles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('permissions')
  @ApiOperation({ summary: '全部权限点' })
  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { code: 'asc' }] });
  }
}
