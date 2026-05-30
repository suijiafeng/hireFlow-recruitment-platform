import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompanyDocDto {
  @ApiProperty({ example: '年假与调休制度' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ description: '正文（入职问答机器人按此内容作答）' })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({ type: [String], example: ['年假', '调休'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateCompanyDocDto extends PartialType(CreateCompanyDocDto) {}
