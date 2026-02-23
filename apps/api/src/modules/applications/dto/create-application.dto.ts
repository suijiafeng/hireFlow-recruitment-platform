import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({ description: '候选人 id' })
  @IsString()
  candidateId: string;

  @ApiProperty({ description: '职位 id' })
  @IsString()
  jobId: string;

  @ApiPropertyOptional({ description: '初始阶段 id，默认为该职位第一个阶段' })
  @IsOptional()
  @IsString()
  stageId?: string;
}
