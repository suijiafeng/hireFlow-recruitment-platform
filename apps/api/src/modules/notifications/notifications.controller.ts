import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '我的站内通知（含未读数）' })
  list(@CurrentUser() user: JwtUser, @Query('unread') unread?: string) {
    return this.notificationsService.list(user.sub, unread === 'true');
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '标记已读' })
  markRead(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: '全部标记已读' })
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.notificationsService.markAllRead(user.sub);
  }
}
