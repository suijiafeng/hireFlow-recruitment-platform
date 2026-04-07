import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RespondDto } from './dto/create-offer.dto';
import { OffersService } from './offers.service';

/**
 * 候选人免登录 Offer 门户。
 * 链接即凭证：令牌为 192 位随机数，不可枚举；所有动作以候选人身份留痕。
 */
@ApiTags('portal')
@Public()
@Controller('portal/offers')
export class OfferPortalController {
  constructor(private readonly offersService: OffersService) {}

  @Get(':token')
  @ApiOperation({ summary: '候选人查看 Offer（含答复截止倒计时）' })
  view(@Param('token') token: string) {
    return this.offersService.portalView(token);
  }

  @Post(':token/respond')
  @ApiOperation({ summary: '候选人接受/拒绝 Offer（拒绝必选原因码）' })
  respond(@Param('token') token: string, @Body() dto: RespondDto) {
    return this.offersService.portalRespond(token, dto);
  }
}
