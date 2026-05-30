import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description: '该角色的全量权限码（缺失的视为移除），如 ["job:read", "candidate:read"]',
    example: ['job:read', 'candidate:read'],
  })
  @IsArray()
  @IsString({ each: true })
  codes: string[];
}
