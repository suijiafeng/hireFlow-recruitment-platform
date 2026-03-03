import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class MoveStageDto {
  @ApiProperty({ description: '目标阶段 id（须属于同一职位）' })
  @IsString()
  stageId: string;

  @ApiPropertyOptional({ description: '目标列内排序值，缺省排到列尾' })
  @IsOptional()
  @IsNumber()
  position?: number;
}
