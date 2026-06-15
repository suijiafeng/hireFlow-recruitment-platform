import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** 洞察页的时间范围。口径见 AnalyticsService.insights：按应聘创建时间划同期群 */
export const INSIGHTS_RANGES = ['30d', 'quarter', 'year', 'all'] as const;
export type InsightsRange = (typeof INSIGHTS_RANGES)[number];

export class QueryInsightsDto {
  @ApiPropertyOptional({
    enum: INSIGHTS_RANGES,
    default: 'all',
    description: '时间范围；按「应聘创建时间」划同期群，缺省为全部',
  })
  @IsOptional()
  @IsIn(INSIGHTS_RANGES)
  range?: InsightsRange = 'all';

  @ApiPropertyOptional({ description: '按职位所属部门过滤' })
  @IsOptional()
  @IsString()
  deptId?: string;
}
