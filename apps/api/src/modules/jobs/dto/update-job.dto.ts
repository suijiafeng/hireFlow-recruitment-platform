import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { JobStatus } from '@hireflow/shared';
import { CreateJobDto } from './create-job.dto';

/** 评分卡维度（能力维度+权重；锚点描述后续扩展） */
export class ScorecardDimensionDto {
  @IsString()
  @MaxLength(20)
  dimension: string;

  @IsInt()
  @Min(0)
  @Max(100)
  weight: number;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {
  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ description: '岗位评分卡模板（2-8 个维度），null 恢复全局默认' })
  @IsOptional()
  @ArrayNotEmpty()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ScorecardDimensionDto)
  scorecardTemplate?: ScorecardDimensionDto[];
}
