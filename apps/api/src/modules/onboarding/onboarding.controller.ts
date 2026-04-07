import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AddDocumentDto, ToggleChecklistDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('onboardings')
  @RequirePermissions(PERMISSIONS.ONBOARDING_READ)
  @ApiOperation({ summary: '入职单列表（含清单进度）' })
  list() {
    return this.onboardingService.list();
  }

  @Get('onboardings/:id')
  @RequirePermissions(PERMISSIONS.ONBOARDING_READ)
  @ApiOperation({ summary: '入职单详情（清单/材料/合同）' })
  get(@Param('id') id: string) {
    return this.onboardingService.get(id);
  }

  @Patch('onboardings/:id/checklist/:key')
  @RequirePermissions(PERMISSIONS.ONBOARDING_READ)
  @ApiOperation({ summary: '勾选/取消三方待办项（服务层按角色约束勾选范围）' })
  toggle(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: ToggleChecklistDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.onboardingService.toggleItem(id, key, dto.done, user);
  }

  @Post('onboardings/:id/documents')
  @RequirePermissions(PERMISSIONS.ONBOARDING_UPLOAD)
  @ApiOperation({ summary: '提交入职材料（OCR 抽取字段并入档）' })
  addDocument(@Param('id') id: string, @Body() dto: AddDocumentDto, @CurrentUser() user: JwtUser) {
    return this.onboardingService.addDocument(id, dto, user);
  }

  @Post('onboardings/:id/portal-link')
  @RequirePermissions(PERMISSIONS.ONBOARDING_MANAGE)
  @ApiOperation({ summary: '获取/补发新员工门户令牌（前端拼 /portal/onboarding/:token）' })
  async portalLink(@Param('id') id: string) {
    return { token: await this.onboardingService.ensurePortalToken(id) };
  }

  @Post('onboardings/:id/contract')
  @RequirePermissions(PERMISSIONS.ONBOARDING_MANAGE)
  @ApiOperation({ summary: '生成劳动合同（模板变量自动填充）' })
  createContract(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.onboardingService.createContract(id, user);
  }

  @Post('contracts/:id/send')
  @RequirePermissions(PERMISSIONS.ONBOARDING_MANAGE)
  @ApiOperation({ summary: '发送合同至电子签' })
  sendContract(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.onboardingService.sendContract(id, user);
  }

  @Post('contracts/:id/sign')
  @RequirePermissions(PERMISSIONS.ONBOARDING_MANAGE)
  @ApiOperation({ summary: '完成签署（HR 代签 mock；新员工自签走门户）' })
  signContract(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.onboardingService.signContract(id, user);
  }
}
