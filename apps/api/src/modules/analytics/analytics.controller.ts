import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';
import { QueryInsightsDto } from './dto/query-insights.dto';

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

  @Get('todos')
  @ApiOperation({ summary: '我的待办聚合（To-Do Center）' })
  todos(@CurrentUser() user: JwtUser) {
    return this.analyticsService.todos(user);
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

  @Get('trend')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: '近 8 周投递/入职趋势（大盘折线图）' })
  trend() {
    return this.analyticsService.trend();
  }

  @Get('insights')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({
    summary: '数据洞察（TTH/渠道/面试官/毁约/阶段停留回放）',
    description:
      'range 与 deptId 按「应聘创建时间」划同期群，五组指标共用同一 scope；响应 scope 字段回显实际生效口径与样本量。',
  })
  insights(@Query() query: QueryInsightsDto) {
    return this.analyticsService.insights(query);
  }
}
