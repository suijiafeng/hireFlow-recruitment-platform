import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DepartmentsService } from './departments.service';

class CreateDepartmentDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

class UpdateDepartmentDto {
  @IsString()
  @MinLength(1)
  name: string;
}

@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: '部门列表' })
  list() {
    return this.departmentsService.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @ApiOperation({ summary: '创建部门' })
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: JwtUser) {
    return this.departmentsService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @ApiOperation({ summary: '部门改名' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() user: JwtUser) {
    return this.departmentsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @ApiOperation({ summary: '删除部门（仅当职位/成员/子部门均为空）' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.departmentsService.remove(id, user);
  }
}
