import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, MinLength } from 'class-validator';

export class ToggleChecklistDto {
  @ApiProperty({ description: '是否完成' })
  @IsBoolean()
  done: boolean;
}

export class AddDocumentDto {
  @ApiProperty({ enum: ['ID_CARD', 'BANK_CARD', 'DIPLOMA'], description: '材料类型' })
  @IsIn(['ID_CARD', 'BANK_CARD', 'DIPLOMA'])
  type: 'ID_CARD' | 'BANK_CARD' | 'DIPLOMA';

  @ApiProperty({
    description: '材料文本内容（三期先粘贴文本模拟拍照，OCR 抽取关键字段；后续接图片上传）',
  })
  @IsString()
  @MinLength(6, { message: '材料内容过短' })
  rawText: string;
}
