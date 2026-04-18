import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ToggleChecklistDto {
  @ApiProperty({ description: '是否完成' })
  @IsBoolean()
  done: boolean;
}

export class AddDocumentDto {
  @ApiProperty({ enum: ['ID_CARD', 'BANK_CARD', 'DIPLOMA'], description: '材料类型' })
  @IsIn(['ID_CARD', 'BANK_CARD', 'DIPLOMA'])
  type: 'ID_CARD' | 'BANK_CARD' | 'DIPLOMA';

  @ApiPropertyOptional({
    description:
      '材料文字内容（OCR 文字层）。可与图片同传；只传图片时（mock OCR 无法识图）材料标记「待人工核对」，不自动勾选待办（低置信度阻断）',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: '材料内容过短' })
  rawText?: string;
}
