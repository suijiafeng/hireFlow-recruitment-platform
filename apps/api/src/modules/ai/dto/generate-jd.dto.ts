import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateJdDto {
  @ApiProperty({ example: '后端工程师' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  title: string;

  @ApiPropertyOptional({ example: '技术部' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  departmentName?: string;

  @ApiPropertyOptional({
    example: '需要一个懂 React 和 Node.js 的三年经验前端',
    description: '关键诉求（输入关键诉求自动扩写成完整 JD）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  keywords?: string;
}
