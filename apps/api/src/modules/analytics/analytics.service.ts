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

  /**
   * 近 N 周投递/入职趋势（大盘折线图）：
   * 投递 = Application.createdAt；入职 = onboarding.completed 留痕（与 TTH 口径一致）。
   * 周一为周起点；当前数据量级直接内存分桶。
   */
  async trend(weeks = 8) {
    const WEEK = 7 * 86_400_000;
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 周一=0
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const start = new Date(thisMonday.getTime() - (weeks - 1) * WEEK);

    const [apps, completions] = await Promise.all([
      this.prisma.application.findMany({
        where: { createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      this.prisma.activityLog.findMany({
        where: { action: 'onboarding.completed', createdAt: { gte: start } },
        select: { createdAt: true },
      }),
    ]);

    const label = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const points = Array.from({ length: weeks }, (_, i) => ({
      week: label(new Date(start.getTime() + i * WEEK)),
      applied: 0,
      hired: 0,
    }));
    const bucketOf = (d: Date) =>
      Math.min(weeks - 1, Math.max(0, Math.floor((d.getTime() - start.getTime()) / WEEK)));
    for (const a of apps) points[bucketOf(a.createdAt)].applied += 1;
    for (const c of completions) points[bucketOf(c.createdAt)].hired += 1;
    return { weeks, start: start.toISOString(), points };
  }

  /**
   * 数据洞察（全部基于 Application 状态机事件计算）：
   * TTH 中位数 / 渠道效能 / Offer 接受率 / 面试官效能 / 毁约率 / 阶段停留 P50-P90（ActivityLog 回放）。
   * 当前数据量级直接内存聚合；上量后迁移为物化视图或定时汇总表。
   */
  async insights() {
    const DAY = 86_400_000;
    const median = (nums: number[]) => {
      if (nums.length === 0) return null;
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };
    const percentile = (nums: number[], p: number) => {
      if (nums.length === 0) return null;
      const s = [...nums].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
    };
    const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

    // ---- TTH：Application 创建 → 入职闭环（onboarding.completed 留痕时间，兜底 updatedAt） ----
    const hired = await this.prisma.application.findMany({
      where: { status: 'HIRED' },
      select: { id: true, createdAt: true, updatedAt: true, job: { select: { title: true } } },
    });
    const completions = await this.prisma.activityLog.findMany({
      where: { action: 'onboarding.completed', entityId: { in: hired.map((h) => h.id) } },
      select: { entityId: true, createdAt: true },
    });
    const completedAt = new Map(completions.map((c) => [c.entityId, c.createdAt]));
    const tthByJob = new Map<string, number[]>();
    const tthAll: number[] = [];
    for (const h of hired) {
      const days = ((completedAt.get(h.id) ?? h.updatedAt).getTime() - h.createdAt.getTime()) / DAY;
      tthAll.push(days);
      tthByJob.set(h.job.title, [...(tthByJob.get(h.job.title) ?? []), days]);
    }

    // ---- 渠道效能：投递 / 进面 / Offer / 接受 / 入职（首次有效渠道 = candidate.source） ----
    const apps = await this.prisma.application.findMany({
      select: {
        status: true,
        candidate: { select: { source: true } },
        interviews: { select: { id: true }, take: 1 },
        offer: { select: { sentAt: true, decision: true } },
      },
    });
    const channelMap = new Map<
      string,
      { applied: number; interviewed: number; offered: number; accepted: number; hired: number }
    >();
    for (const a of apps) {
      const key = a.candidate.source ?? '未知渠道';
      const c = channelMap.get(key) ?? { applied: 0, interviewed: 0, offered: 0, accepted: 0, hired: 0 };
      c.applied += 1;
      if (a.interviews.length > 0) c.interviewed += 1;
      if (a.offer?.sentAt) c.offered += 1;
      if (a.offer?.decision === 'ACCEPTED') c.accepted += 1;
      if (a.status === 'HIRED') c.hired += 1;
      channelMap.set(key, c);
    }

    // ---- Offer 接受率（分母 = 已发出；撤回场景暂无独立状态，后续议价流程补充口径） ----
    const sentOffers = await this.prisma.offer.findMany({
      where: { sentAt: { not: null } },
      select: { decision: true, application: { select: { status: true } } },
    });
    const acceptedCount = sentOffers.filter((o) => o.decision === 'ACCEPTED').length;
    // ---- 毁约率：接受 Offer 后（待入职语义）应聘被撤回 ----
    const renegeCount = sentOffers.filter(
      (o) => o.decision === 'ACCEPTED' && o.application.status === 'WITHDRAWN',
    ).length;

    // ---- 面试官效能：面评及时率（24h SLA）+ 结论通过率与全局均值偏离 ----
    const evals = await this.prisma.evaluation.findMany({
      where: { submittedAt: { not: null } },
      select: {
        conclusion: true,
        submittedAt: true,
        interviewer: { select: { id: true, name: true } },
        interview: { select: { scheduledAt: true } },
      },
    });
    const isPass = (c: string | null) => c === 'YES' || c === 'STRONG_YES';
    const overallPassRate = evals.length
      ? evals.filter((e) => isPass(e.conclusion)).length / evals.length
      : 0;
    const interviewerMap = new Map<
      string,
      { name: string; total: number; onTime: number; pass: number }
    >();
    for (const e of evals) {
      const cur =
        interviewerMap.get(e.interviewer.id) ?? { name: e.interviewer.name, total: 0, onTime: 0, pass: 0 };
      cur.total += 1;
      if (
        !e.interview.scheduledAt ||
        (e.submittedAt && e.submittedAt.getTime() - e.interview.scheduledAt.getTime() <= DAY)
      ) {
        cur.onTime += 1;
      }
      if (isPass(e.conclusion)) cur.pass += 1;
      interviewerMap.set(e.interviewer.id, cur);
    }

    // ---- 阶段停留 P50/P90：ActivityLog 回放（进入时间 → 离开时间），精确口径而非快照 ----
    const stageEvents = await this.prisma.activityLog.findMany({
      where: { action: { in: ['application.stage_changed', 'application.stage_reverted'] } },
      orderBy: { createdAt: 'asc' },
      select: { entityId: true, createdAt: true, payload: true },
    });
    const appCreated = new Map(
      (
        await this.prisma.application.findMany({ select: { id: true, createdAt: true } })
      ).map((a) => [a.id, a.createdAt]),
    );
    const byApp = new Map<string, Array<{ at: Date; from: string; to: string }>>();
    for (const ev of stageEvents) {
      const p = ev.payload as { from?: string; to?: string } | null;
      if (!p?.from || !p?.to || !ev.entityId) continue;
      byApp.set(ev.entityId, [
        ...(byApp.get(ev.entityId) ?? []),
        { at: ev.createdAt, from: p.from, to: p.to },
      ]);
    }
    const stayByStage = new Map<string, number[]>();
    for (const [appId, events] of byApp) {
      let enteredAt = appCreated.get(appId);
      for (const ev of events) {
        if (enteredAt) {
          const days = (ev.at.getTime() - enteredAt.getTime()) / DAY;
          stayByStage.set(ev.from, [...(stayByStage.get(ev.from) ?? []), days]);
        }
        enteredAt = ev.at; // 进入 ev.to 的时间
      }
    }

    return {
      tth: {
        medianDays: round1(median(tthAll)),
        hiredCount: hired.length,
        byJob: [...tthByJob.entries()].map(([title, days]) => ({
          jobTitle: title,
          medianDays: round1(median(days)),
          hired: days.length,
        })),
      },
      offer: {
        sent: sentOffers.length,
        accepted: acceptedCount,
        acceptRate: sentOffers.length ? round1((acceptedCount / sentOffers.length) * 100) : null,
        renegeCount,
        renegeRate: acceptedCount ? round1((renegeCount / acceptedCount) * 100) : null,
      },
      channels: [...channelMap.entries()]
        .map(([source, c]) => ({
          source,
          ...c,
          interviewRate: c.applied ? round1((c.interviewed / c.applied) * 100) : null,
          hireRate: c.applied ? round1((c.hired / c.applied) * 100) : null,
        }))
        .sort((a, b) => b.applied - a.applied),
      interviewers: [...interviewerMap.values()]
        .map((i) => ({
          name: i.name,
          evaluations: i.total,
          onTimeRate: round1((i.onTime / i.total) * 100),
          passRate: round1((i.pass / i.total) * 100),
          passRateDeviation: round1(((i.pass / i.total) - overallPassRate) * 100),
        }))
        .sort((a, b) => b.evaluations - a.evaluations),
      overallPassRate: round1(overallPassRate * 100),
      stageStay: [...stayByStage.entries()].map(([stage, days]) => ({
        stage,
        samples: days.length,
        p50Days: round1(percentile(days, 50)),
        p90Days: round1(percentile(days, 90)),
      })),
    };
  }
}
