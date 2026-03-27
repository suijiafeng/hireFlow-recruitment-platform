import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApprovalDto, CreateOfferDto, RespondDto } from './dto/create-offer.dto';
import { OffersService } from './offers.service';

@ApiTags('offers')
@ApiBearerAuth()
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @ApiOperation({ summary: 'Offer 列表（薪资按 salary:view 权限脱敏）' })
  list(@CurrentUser() user: JwtUser) {
    return this.offersService.list(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OFFER_INITIATE)
  @ApiOperation({ summary: '发起 Offer（进入审批）' })
  create(@Body() dto: CreateOfferDto, @CurrentUser() user: JwtUser) {
    return this.offersService.create(dto, user);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.OFFER_APPROVE)
  @ApiOperation({ summary: '审批通过' })
  approve(@Param('id') id: string, @Body() dto: ApprovalDto, @CurrentUser() user: JwtUser) {
    return this.offersService.approve(id, dto, true, user);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.OFFER_APPROVE)
  @ApiOperation({ summary: '审批驳回' })
  reject(@Param('id') id: string, @Body() dto: ApprovalDto, @CurrentUser() user: JwtUser) {
    return this.offersService.approve(id, dto, false, user);
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.OFFER_INITIATE)
  @ApiOperation({ summary: '电子发送 Offer' })
  send(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.offersService.send(id, user);
  }

  @Post(':id/respond')
  @RequirePermissions(PERMISSIONS.OFFER_INITIATE)
  @ApiOperation({ summary: '录入候选人答复（接受则自动创建入职单并移卡）' })
  respond(@Param('id') id: string, @Body() dto: RespondDto, @CurrentUser() user: JwtUser) {
    return this.offersService.respond(id, dto, user);
  }

  @Post(':id/retention')
  @ApiOperation({ summary: 'AI 留存预测（辅助参考）' })
  retention(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.offersService.retention(id, user);
  }
}
