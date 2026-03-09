import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DraftEvaluationDto {
  @ApiProperty({
    description: '面试原始记录/要点（二期先手动粘贴，三期接 ASR 实时转写）',
    example: '候选人对高并发场景的方案设计清晰，Redis 使用经验扎实，但对分布式事务的理解较浅…',
  })
  @IsString()
  @MinLength(10, { message: '面试记录太短，无法生成草稿' })
  notes: string;
}
