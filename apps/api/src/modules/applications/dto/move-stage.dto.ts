import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { REJECT_REASONS } from '@hireflow/shared';

export class MoveStageDto {
  @ApiProperty({ description: '目标阶段 id（须属于同一职位）' })
  @IsString()
  stageId: string;

  @ApiPropertyOptional({ description: '目标列内排序值，缺省排到列尾' })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ description: '回退原因（向前移动不需要；回退必填）' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({ description: '乐观锁版本号：与当前不一致返回 409（并发拖卡防护）' })
  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}

export class RejectApplicationDto {
  @ApiProperty({ enum: REJECT_REASONS, description: '原因码（强制）' })
  @IsIn(REJECT_REASONS as unknown as string[])
  reason: string;

  @ApiPropertyOptional({ description: '补充说明' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
