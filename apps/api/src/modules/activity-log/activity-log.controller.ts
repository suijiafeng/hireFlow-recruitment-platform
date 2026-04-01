import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ActivityLogService } from './activity-log.service';

@ApiTags('activity-log')
@ApiBearerAuth()
@Controller('activities')
export class ActivityLogController {
  constructor(private readonly service: ActivityLogService) {}

  @Get()
  @ApiOperation({ summary: '按实体查询操作时间轴' })
  timeline(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.service.timeline(entityType, entityId);
  }

  @Get('recent')
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @ApiOperation({ summary: '审计日志：全局最近操作（分页）' })
  recent(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.service.recent(Number(page) || 1, Math.min(Number(pageSize) || 20, 100));
  }
}
