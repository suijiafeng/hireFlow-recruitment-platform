import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AddDocumentDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

/**
 * 新员工免登录入职门户（H5 资料收集 + 电子签）。
 * 链接即凭证，所有动作以候选人身份留痕。
 */
@ApiTags('portal')
@Public()
@Controller('portal/onboardings')
export class OnboardingPortalController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get(':token')
  @ApiOperation({ summary: '新员工查看入职单（清单/材料/合同状态）' })
  view(@Param('token') token: string) {
    return this.onboardingService.portalView(token);
  }

  @Post(':token/documents')
  @ApiOperation({ summary: '新员工提交材料（OCR 识别核对 + 自动勾选待办）' })
  addDocument(@Param('token') token: string, @Body() dto: AddDocumentDto) {
    return this.onboardingService.portalAddDocument(token, dto);
  }

  @Post(':token/contract/sign')
  @ApiOperation({ summary: '新员工签署劳动合同（电子签 mock）' })
  signContract(@Param('token') token: string) {
    return this.onboardingService.portalSignContract(token);
  }
}
