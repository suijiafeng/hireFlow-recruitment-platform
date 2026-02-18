import { Injectable } from '@nestjs/common';
import type { ActivityAction } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录一条操作留痕。
   * 与业务写库不在同一事务，失败不阻断主流程；需要强一致时传入 tx。
   */
  async record(
    actor: JwtUser | null,
    action: ActivityAction,
    entityType: string,
    entityId: string,
    payload?: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.activityLog.create({
      data: {
        actorId: actor?.sub ?? null,
        actorName: actor?.name ?? '系统',
        action,
        entityType,
        entityId,
        payload,
      },
    });
  }

  /** 查询某实体的时间轴（倒序） */
  async timeline(entityType: string, entityId: string, limit = 50) {
    return this.prisma.activityLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, name: true } } },
    });
  }
}
