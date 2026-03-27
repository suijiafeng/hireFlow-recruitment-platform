import { Injectable, Logger } from '@nestjs/common';
import { RoleCode } from '@hireflow/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 站内通知（通知矩阵的站内信渠道）。
 * 推送失败不抛错、不阻断主流程；邮件/IM 渠道后续在此扩展。
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 给指定用户推送站内信 */
  async push(userIds: string[], title: string, body?: string, link?: string) {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: unique.map((userId) => ({ userId, title, body, link })),
      });
    } catch (error) {
      this.logger.warn(`站内信推送失败：${error instanceof Error ? error.message : error}`);
    }
  }

  /** 按角色推送（如：通知所有 HR） */
  async pushToRole(role: RoleCode, title: string, body?: string, link?: string) {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: role } } } },
      select: { id: true },
    });
    await this.push(
      users.map((u) => u.id),
      title,
      body,
      link,
    );
  }

  async list(userId: string, unreadOnly = false) {
    const [items, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { read: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    return this.list(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return this.list(userId);
  }
}
