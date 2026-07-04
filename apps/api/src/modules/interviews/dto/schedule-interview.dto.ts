import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from 'class-validator';

/** HR 直接敲定/改期一场已存在的面试（与候选人自助选时并列的另一条路径） */
export class ScheduleInterviewDto {
  @ApiProperty({ description: '面试时间（ISO 8601）' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ description: '时长（分钟），缺省沿用原值或 60' })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMins?: number;

  @ApiPropertyOptional({ description: '面试官同期已有其他面试时，置 true 表示确认仍要安排' })
  @IsOptional()
  @IsBoolean()
  ignoreConflict?: boolean;
}
