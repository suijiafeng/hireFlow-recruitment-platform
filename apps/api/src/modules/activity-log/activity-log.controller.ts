import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
