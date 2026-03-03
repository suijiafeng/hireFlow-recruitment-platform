import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { MoveStageDto } from './dto/move-stage.dto';

@ApiTags('applications')
@ApiBearerAuth()
@Controller()
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  @RequirePermissions(PERMISSIONS.APPLICATION_CREATE)
  @ApiOperation({ summary: '创建应聘记录（投递/导入）' })
  create(@Body() dto: CreateApplicationDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.create(dto, user);
  }

  @Get('jobs/:jobId/board')
  @RequirePermissions(PERMISSIONS.CANDIDATE_READ)
  @ApiOperation({ summary: '职位看板数据（按阶段分组）' })
  board(@Param('jobId') jobId: string) {
    return this.applicationsService.board(jobId);
  }

  @Patch('applications/:id/stage')
  @RequirePermissions(PERMISSIONS.APPLICATION_MOVE)
  @ApiOperation({ summary: '移动卡片到目标阶段（写入留痕）' })
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.moveStage(id, dto, user);
  }
}
