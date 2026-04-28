import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { BatchMoveDto, BatchRejectDto, MoveStageDto, RejectApplicationDto } from './dto/move-stage.dto';

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
  board(@Param('jobId') jobId: string, @CurrentUser() user: JwtUser) {
    return this.applicationsService.board(jobId, user);
  }

  @Patch('applications/:id/stage')
  @RequirePermissions(PERMISSIONS.APPLICATION_MOVE)
  @ApiOperation({ summary: '移动卡片到目标阶段（写入留痕）' })
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.moveStage(id, dto, user);
  }

  @Post('applications/:id/score')
  @RequirePermissions(PERMISSIONS.APPLICATION_MOVE)
  @ApiOperation({ summary: 'AI 岗位匹配度评分（可解释报告回写）' })
  score(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.applicationsService.score(id, user);
  }

  // 批量路由必须声明在 :id 参数路由之前（Nest 按声明顺序匹配，否则 "batch" 会被当作 :id）
  @Post('applications/batch/reject')
  @RequirePermissions(PERMISSIONS.APPLICATION_MOVE)
  @ApiOperation({ summary: '批量淘汰（≤100 条，返回成败明细）' })
  batchReject(@Body() dto: BatchRejectDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.batchReject(dto, user);
  }

  @Post('applications/batch/move')
  @RequirePermissions(PERMISSIONS.APPLICATION_MOVE)
  @ApiOperation({ summary: '批量移动阶段（≤100 条，返回成败明细）' })
  batchMove(@Body() dto: BatchMoveDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.batchMove(dto, user);
  }

  @Post('applications/:id/reject')
  @RequirePermissions(PERMISSIONS.APPLICATION_MOVE)
  @ApiOperation({ summary: '淘汰候选人（原因码强制，终态不可逆）' })
  reject(@Param('id') id: string, @Body() dto: RejectApplicationDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.reject(id, dto, user);
  }
}
