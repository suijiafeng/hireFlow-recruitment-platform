import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class AddResumeDto {
  @ApiProperty({ description: '简历原文（纯文本粘贴导入；文件上传三期接对象存储）' })
  @IsString()
  @MinLength(20, { message: '简历文本过短' })
  rawText: string;

  @ApiPropertyOptional({ example: '张三-简历.txt' })
  @IsOptional()
  @IsString()
  fileName?: string;
}
