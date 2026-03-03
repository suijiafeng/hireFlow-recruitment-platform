import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EvaluationConclusion } from '@hireflow/shared';

export class ScorecardItemDto {
  @ApiProperty({ example: '技术能力' })
  @IsString()
  dimension: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @ApiPropertyOptional({ example: '基础扎实，对高并发场景有实战经验' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class SubmitEvaluationDto {
  @ApiProperty({ type: [ScorecardItemDto], description: '结构化评分卡' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScorecardItemDto)
  scorecard: ScorecardItemDto[];

  @ApiProperty({ enum: EvaluationConclusion })
  @IsEnum(EvaluationConclusion)
  conclusion: EvaluationConclusion;

  @ApiPropertyOptional({ description: '文字评语' })
  @IsOptional()
  @IsString()
  comments?: string;
}
