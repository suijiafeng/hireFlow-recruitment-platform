import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { ApplicationsService } from './applications.service';

class PrescreenSubmitDto {
  @IsInt()
  @Min(1000)
  @Max(1_000_000)
  @Type(() => Number)
  expectedSalary: number;

  @IsDateString()
  availableDate: string;

  @IsBoolean()
  travelOk: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/**
 * 候选人预筛门户（AI 预筛机器人）：邀约前自动核实硬性条件。
 * 链接即凭证；不符项仅标记并通知 HR，绝不自动淘汰（AI 永不直接淘汰人）。
 */
@ApiTags('portal')
@Public()
@Controller('portal/prescreen')
export class PrescreenPortalController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get(':token')
  @ApiOperation({ summary: '候选人查看预筛问卷（已提交则显示结果）' })
  view(@Param('token') token: string) {
    return this.applicationsService.prescreenView(token);
  }

  @Post(':token')
  @ApiOperation({ summary: '候选人提交预筛三问（薪资/到岗/出差）' })
  submit(@Param('token') token: string, @Body() dto: PrescreenSubmitDto) {
    return this.applicationsService.prescreenSubmit(token, dto);
  }
}
