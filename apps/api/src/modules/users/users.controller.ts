import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '内部用户列表（可按角色过滤，如 ?role=INTERVIEWER）' })
  @ApiQuery({ name: 'role', required: false })
  list(@Query('role') role?: string) {
    return this.usersService.list(role);
  }

  @Patch(':id/roles')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: '更新用户角色（全量替换；相关用户重新登录后生效）' })
  updateRoles(@Param('id') id: string, @Body() dto: UpdateUserRolesDto, @CurrentUser() user: JwtUser) {
    return this.usersService.updateRoles(id, dto.roleCodes, user);
  }
}
