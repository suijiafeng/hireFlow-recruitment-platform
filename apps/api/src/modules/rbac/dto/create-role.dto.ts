import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataScope } from '@hireflow/shared';
import { ArrayUnique, IsArray, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'RECRUITING_COORDINATOR',
    description: '角色码，大写字母 + 下划线；创建后不可修改，权限判定以它为准',
  })
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: '角色码只能用大写字母、数字与下划线，且以字母开头' })
  code!: string;

  @ApiProperty({ example: '招聘协调员', description: '展示名' })
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiPropertyOptional({
    enum: DataScope,
    default: DataScope.ASSIGNED,
    description: '数据范围；缺省最小权限 ASSIGNED（仅被指派）',
  })
  @IsOptional()
  @IsEnum(DataScope)
  dataScope?: DataScope = DataScope.ASSIGNED;

  @ApiPropertyOptional({ type: [String], description: '初始功能点权限码；缺省为空（可创建后再配）' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[] = [];
}
