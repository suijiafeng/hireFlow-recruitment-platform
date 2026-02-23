import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCandidateDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'zhangsan@example.com' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @ApiPropertyOptional({ example: '13800000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '来源渠道', example: 'BOSS直聘' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: [String], example: ['React', '高并发'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
