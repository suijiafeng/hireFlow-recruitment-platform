import { Injectable, NotFoundException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /** 大盘总览指标 */
  async overview() {
    const now = new Date();
    const [openJobs, candidates, upcomingInterviews, hired] = await this.prisma.$transaction([
      this.prisma.job.count({ where: { status: 'OPEN' } }),
      this.prisma.candidate.count(),
      this.prisma.interview.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: now } } }),
      this.prisma.application.count({ where: { status: 'HIRED' } }),
    ]);
    return { openJobs, candidates, upcomingInterviews, hired };
  }

  /**
   * 招聘漏斗：
   * 「到达某阶段的人数」按快照口径近似 = 停留在该阶段及其之后所有阶段的人数之和。
   */
  async funnel(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: { _count: { select: { applications: true } } },
        },
      },
    });
    if (!job) throw new NotFoundException('职位不存在');

    const counts = job.stages.map((s) => s._count.applications);
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
