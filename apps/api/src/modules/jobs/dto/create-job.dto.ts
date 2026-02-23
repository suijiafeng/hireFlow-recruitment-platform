import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: '后端工程师' })
  @IsString()
  @MinLength(2, { message: '职位名称至少 2 个字符' })
  title: string;

  @ApiProperty({ description: '所属部门 id' })
  @IsString()
  departmentId: string;

  @ApiPropertyOptional({ description: '用人经理 userId' })
  @IsOptional()
  @IsString()
  hiringManagerId?: string;

  @ApiPropertyOptional({ description: 'JD 全文' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '任职要求' })
  @IsOptional()
  @IsString()
  requirement?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  headcount?: number;
}
