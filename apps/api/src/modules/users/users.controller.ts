import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
}
