import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
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

/** 批量淘汰（单次上限 100 防误操作） */
export class BatchRejectDto extends RejectApplicationDto {
  @ApiProperty({ description: '应聘记录 id 列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}

/** 批量移动阶段（同一职位内；含回退卡时 reason 必填，与单卡规则一致） */
export class BatchMoveDto {
  @ApiProperty({ description: '应聘记录 id 列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ description: '目标阶段 id' })
  @IsString()
  stageId: string;

  @ApiPropertyOptional({ description: '回退原因（批量中含回退卡时必填，应用于全部回退卡）' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason?: string;
}
