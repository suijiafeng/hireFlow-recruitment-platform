import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateOfferDto {
  @ApiProperty({ description: '应聘记录 id' })
  @IsString()
  applicationId: string;

  @ApiProperty({ description: '月薪（base，元）', example: 30000 })
  @IsInt()
  @Min(1000)
  @Max(1_000_000)
  salaryBase: number;

  @ApiPropertyOptional({ description: '年终奖月数', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  bonusMonths?: number;

  @ApiPropertyOptional({ description: '职级', example: 'P6' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  grade?: string;

  @ApiPropertyOptional({ description: '备注（审批人可见）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ApprovalDto {
  @ApiPropertyOptional({ description: '审批意见' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RespondDto {
  @ApiProperty({ enum: ['ACCEPTED', 'DECLINED'], description: '候选人答复' })
  @IsIn(['ACCEPTED', 'DECLINED'])
  decision: 'ACCEPTED' | 'DECLINED';
}
