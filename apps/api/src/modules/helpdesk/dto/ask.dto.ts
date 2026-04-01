import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskDto {
  @ApiProperty({ example: '公积金比例是多少？' })
  @IsString()
  @MinLength(2, { message: '问题太短' })
  @MaxLength(300)
  question: string;
}
