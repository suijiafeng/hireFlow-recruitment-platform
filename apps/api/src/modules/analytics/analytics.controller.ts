import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: '大盘总览指标' })
  overview() {
    return this.analyticsService.overview();
  }

  @Get('funnel/:jobId')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: '职位招聘漏斗（人数与转化率）' })
  funnel(@Param('jobId') jobId: string) {
    return this.analyticsService.funnel(jobId);
  }

  @Post('insight/:jobId')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: 'AI 招聘健康度诊断' })
  insight(@Param('jobId') jobId: string) {
    return this.analyticsService.insight(jobId);
  }
}
