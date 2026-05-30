import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class UpdateUserRolesDto {
  @ApiProperty({
    type: [String],
    description: '该用户的全量角色码（缺失的视为移除），如 ["HR", "INTERVIEWER"]',
    example: ['HR'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: '至少保留一个角色' })
  @IsString({ each: true })
  roleCodes: string[];
}
