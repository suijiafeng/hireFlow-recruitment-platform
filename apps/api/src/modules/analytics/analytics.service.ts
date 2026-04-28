import { Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /** 待办事项聚合 To-Do Center */
  async todos(user: JwtUser) {
    const now = new Date();
    // 待处理新简历：停留在各职位第一阶段的在途应聘
    const newResumes = await this.prisma.application.count({
      where: { status: 'ACTIVE', stage: { order: 0 }, job: { status: 'OPEN' } },
    });
    // 我的待提交面评：我被指派、面试时间已过、且我尚未提交评价
    const myPendingEvaluations = await this.prisma.interview.count({
      where: {
        status: { not: 'CANCELED' },
        scheduledAt: { lte: now },
        interviewers: { some: { userId: user.sub } },
        evaluations: { none: { interviewerId: user.sub } },
      },
    });
    const pendingOffers = user.permissions.includes(PERMISSIONS.OFFER_APPROVE)
      ? await this.prisma.offer.count({ where: { approvalStatus: 'PENDING' } })
      : null;
    // Offer 双待办：通知会被刷走，待办卡才是工作驱动
    const canInitiate = user.permissions.includes(PERMISSIONS.OFFER_INITIATE);
    const rejectedOffers = canInitiate
      ? await this.prisma.offer.count({ where: { approvalStatus: 'REJECTED' } })
      : null;
    const offersDue = canInitiate
      ? await this.prisma.offer.count({
          where: {
            OR: [
              { approvalStatus: 'EXPIRED', extendedOnce: false }, // 已失效可续期
              {
                approvalStatus: 'SENT',
                decision: null,
                expiresAt: { lte: new Date(now.getTime() + 24 * 3600 * 1000) }, // 24h 内到期
              },
            ],
          },
        })
      : null;
    const onboardingInProgress = await this.prisma.onboarding.count({
      where: { status: 'IN_PROGRESS' },
    });
    // 待人工核对材料（低置信度阻断）：documents 为 JSON 数组，量小直接内存过滤
    const inProgress = await this.prisma.onboarding.findMany({
      where: { status: 'IN_PROGRESS' },
      select: { documents: true },
    });
    const docsNeedReview = inProgress.reduce((sum, o) => {
      const docs = (o.documents as Array<{ needsReview?: boolean }> | null) ?? [];
      return sum + docs.filter((d) => d.needsReview).length;
    }, 0);
    return {
      newResumes,
      myPendingEvaluations,
      pendingOffers,
      rejectedOffers,
      offersDue,
      onboardingInProgress,
      docsNeedReview,
    };
  }

  /** 大盘总览指标。pausedJobs 单列：满编自动暂停后「招聘中 0」需要有解释 */
  async overview() {
    const now = new Date();
    const [openJobs, pausedJobs, candidates, upcomingInterviews, hired] = await this.prisma.$transaction([
      this.prisma.job.count({ where: { status: 'OPEN' } }),
      this.prisma.job.count({ where: { status: 'PAUSED' } }),
      this.prisma.candidate.count(),
      this.prisma.interview.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: now } } }),
      this.prisma.application.count({ where: { status: 'HIRED' } }),
    ]);
    return { openJobs, pausedJobs, candidates, upcomingInterviews, hired };
  }

  /**
   * 招聘漏斗：
   * 「到达某阶段的人数」按快照口径近似 = 停留在该阶段及其之后所有阶段的人数之和。
   * 口径修正：中间列只计 ACTIVE（淘汰/撤回已离开漏斗）；
   * 末列「已入职」以 status=HIRED 为准——手动拖进终列的卡不再虚报入职数。
   */
  async funnel(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!job) throw new NotFoundException('职位不存在');

    const grouped = await this.prisma.application.groupBy({
      by: ['stageId', 'status'],
      where: { jobId },
      _count: { _all: true },
    });
    const activeAt = new Map<string, number>();
    let hiredTotal = 0;
    for (const g of grouped) {
      if (g.status === 'ACTIVE') activeAt.set(g.stageId, g._count._all);
      if (g.status === 'HIRED') hiredTotal += g._count._all;
    }
    const lastIndex = job.stages.length - 1;
    const counts = job.stages.map((s, i) =>
      i === lastIndex ? hiredTotal : (activeAt.get(s.id) ?? 0),
    );
    const reached = counts.map((_, i) => counts.slice(i).reduce((a, b) => a + b, 0));

    return {
      job: { id: job.id, title: job.title },
      stages: job.stages.map((stage, i) => ({
        id: stage.id,
        name: stage.name,
        /** 当前停留人数 */
        current: counts[i],
        /** 到达过该阶段的人数（快照近似） */
        reached: reached[i],
        /** 相对上一阶段的转化率（0-1，首阶段为 null） */
        conversion: i === 0 || reached[i - 1] === 0 ? null : reached[i] / reached[i - 1],
      })),
    };
  }

  /** AI 招聘健康度诊断 */
  async insight(jobId: string) {
    const funnel = await this.funnel(jobId);
    const { data, meta } = await this.ai.funnelInsight({
      jobTitle: funnel.job.title,
      stages: funnel.stages.map((s) => ({ name: s.name, count: s.reached })),
    });
    return { insight: data, aiMeta: meta };
  }
}
