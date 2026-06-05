import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { fileTypeFilter, ONBOARDING_DOCUMENT_MIME_TYPES } from '../../common/upload';
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

  @Post(':token/documents/file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: fileTypeFilter(ONBOARDING_DOCUMENT_MIME_TYPES),
    }),
  )
  @ApiOperation({ summary: '新员工拍照上传材料（图片留档；可附文字走 OCR，纯图片转人工核对）' })
  addDocumentFile(
    @Param('token') token: string,
    @Body() dto: AddDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.onboardingService.portalAddDocument(token, dto, file);
  }

  @Post(':token/contract/sign')
  @ApiOperation({ summary: '新员工签署劳动合同（电子签 mock）' })
  signContract(@Param('token') token: string) {
    return this.onboardingService.portalSignContract(token);
  }
}
