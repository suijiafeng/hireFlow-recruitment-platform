import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateInterviewDto {
  @ApiProperty({ description: '应聘记录 id' })
  @IsString()
  applicationId: string;

  @ApiProperty({ description: '面试轮次，从 1 开始', example: 1 })
  @IsInt()
  @Min(1)
  round: number;

  @ApiPropertyOptional({ description: '面试时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: '时长（分钟）', example: 60 })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMins?: number;

  @ApiPropertyOptional({ description: '会议链接（二期接会议 OpenAPI 自动生成）' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiProperty({ type: [String], description: '面试官 userId 列表' })
  @IsArray()
  @ArrayMinSize(1, { message: '至少指派一名面试官' })
  @IsString({ each: true })
  interviewerIds: string[];
}
