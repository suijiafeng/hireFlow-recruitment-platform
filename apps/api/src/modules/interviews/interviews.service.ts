import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACTIVITY_ACTIONS, RoleCode } from '@hireflow/shared';
import { departmentScopeOf, isAssignedScope } from '../../common/data-scope';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { candidateActor, CN_TZ_OFFSET_MS, newPortalToken } from '../../common/portal';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';

const INTERVIEW_INCLUDE = {
  interviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
  evaluations: { include: { interviewer: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 安排一场面试并指派面试官（二期接入日历协同后自动生成会议链接） */
  async create(dto: CreateInterviewDto, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');
    if (application.status !== 'ACTIVE') {
      throw new BadRequestException('已淘汰/已入职的应聘记录不可再安排面试');
    }

    const interview = await this.prisma.interview.create({
      data: {
        applicationId: dto.applicationId,
        round: dto.round,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        durationMins: dto.durationMins,
        meetingUrl: dto.meetingUrl,
        interviewers: { create: dto.interviewerIds.map((userId) => ({ userId })) },
      },
      include: INTERVIEW_INCLUDE,
    });

    await this.activityLog.record(
      user,
      ACTIVITY_ACTIONS.INTERVIEW_SCHEDULED,
      'Application',
      dto.applicationId,
      {
        candidate: application.candidate.name,
        round: dto.round,
        scheduledAt: dto.scheduledAt ?? null,
        interviewers: interview.interviewers.map((i) => i.user.name),
      },
    );
    // 通知矩阵：面试确认 → 面试官（日历/IM 通道后续接入）
    await this.notifications.push(
      dto.interviewerIds,
      `新面试指派：${application.candidate.name}（第 ${dto.round} 轮）`,
      `${application.job.title}${dto.scheduledAt ? ` · ${new Date(dto.scheduledAt).toLocaleString('zh-CN')}` : ' · 时间待定'}`,
      '/interviews',
    );
    return interview;
  }

  /** 取消面试：仅未开始的场次；通知被指派面试官，留痕后状态终结 */
  async cancel(id: string, user: JwtUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        interviewers: true,
        application: { include: { candidate: { select: { name: true } } } },
      },
    });
    if (!interview) throw new NotFoundException('面试不存在');
    if (interview.status !== 'SCHEDULED') {
      throw new BadRequestException('仅已安排未进行的面试可取消');
    }
    const updated = await this.prisma.interview.update({
      where: { id },
      data: { status: 'CANCELED' },
      include: INTERVIEW_INCLUDE,
    });
    // 释放候选人自助选定的面试官时段：否则该时段永久卡在「已占用」，面试官既约不出去也删不掉
    await this.prisma.interviewerSlot.updateMany({
      where: { bookedBy: id },
      data: { bookedBy: null },
    });
    await this.activityLog.record(
      user,
      ACTIVITY_ACTIONS.INTERVIEW_CANCELED,
      'Application',
      interview.applicationId,
      { candidate: interview.application.candidate.name, round: interview.round },
    );
    await this.notifications.push(
      interview.interviewers.map((i) => i.userId),
      `面试已取消：${interview.application.candidate.name}（第 ${interview.round} 轮）`,
      undefined,
      '/interviews',
    );
    return updated;
  }

  /**
   * 惰性收口：已过约定时间且未取消的面试自动置为 COMPLETED。
   * 与 offers.expireIfDue 同一套路——没有定时任务，就在读路径上把到期状态补齐；
   * 否则 Interview 永远停在 SCHEDULED，面试管理页的「待我面评」筛选与提交入口全部够不着。
   */
  private async completeDueInterviews() {
    await this.prisma.interview.updateMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      data: { status: 'COMPLETED' },
    });
  }

  /** 按应聘记录查询；不传 applicationId 时返回近期面试总览（面试管理页用） */
  async list(applicationId?: string, user?: JwtUser) {
    await this.completeDueInterviews();
    // 数据行级权限：面试官仅被指派的面试；用人经理仅本部门
    const scopeWhere: Prisma.InterviewWhereInput = {};
    if (user && isAssignedScope(user)) {
      scopeWhere.interviewers = { some: { userId: user.sub } };
    }
    const deptScope = user ? departmentScopeOf(user) : null;
    if (deptScope) {
      scopeWhere.application = { job: { departmentId: deptScope } };
    }
    if (applicationId) {
      return this.prisma.interview.findMany({
        where: { applicationId, ...scopeWhere },
        include: INTERVIEW_INCLUDE,
        orderBy: { round: 'asc' },
      });
    }
    return this.prisma.interview.findMany({
      where: scopeWhere,
      include: {
        ...INTERVIEW_INCLUDE,
        application: {
          select: {
            id: true,
            candidate: { select: { id: true, name: true } },
            job: { select: { id: true, title: true, scorecardTemplate: true } },
            stage: { select: { name: true } },
          },
        },
      },
      orderBy: [{ scheduledAt: 'desc' }],
      take: 100,
    });
  }

  /**
   * AI 面评草稿（面试 Copilot）：
   * 面试官的原始记录 → 结构化评分卡草稿，返回给前端预填，最终由人修改确认。
   */
  async draftEvaluation(interviewId: string, notes: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: { select: { name: true } },
            job: { select: { title: true, scorecardTemplate: true } },
          },
        },
      },
    });
    if (!interview) throw new NotFoundException('面试不存在');

    // 岗位评分卡模板：AI 草稿按模板维度输出，与面评表单一致
    const template = interview.application.job.scorecardTemplate as
      | Array<{ dimension: string }>
      | null;
    const { data, meta } = await this.ai.draftEvaluation({
      candidateName: interview.application.candidate.name,
      jobTitle: interview.application.job.title,
      round: interview.round,
      notes,
      dimensions: template?.map((t) => t.dimension),
    });
    return { ...data, aiMeta: meta };
  }

  /** 提交/更新面评（同一面试官对同一场面试仅一份，重复提交视为修订） */
  async submitEvaluation(interviewId: string, dto: SubmitEvaluationDto, user: JwtUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        interviewers: true,
        application: { include: { candidate: { select: { name: true } } } },
      },
    });
    if (!interview) throw new NotFoundException('面试不存在');
    if (interview.status === 'CANCELED') {
      throw new BadRequestException('该面试已取消，不可提交评价');
    }
    // 「仅被指派」范围的面试官只能对自己参与的场次打分；HR/管理员/用人经理按其原有数据范围不受此限
    if (isAssignedScope(user) && !interview.interviewers.some((i) => i.userId === user.sub)) {
      throw new ForbiddenException('仅可对自己被指派的面试提交评价');
    }

    const evaluation = await this.prisma.evaluation.upsert({
      where: { interviewId_interviewerId: { interviewId, interviewerId: user.sub } },
      create: {
        interviewId,
        interviewerId: user.sub,
        scorecard: dto.scorecard.map((s) => ({ ...s })),
        conclusion: dto.conclusion,
        comments: dto.comments,
        submittedAt: new Date(),
      },
      update: {
        scorecard: dto.scorecard.map((s) => ({ ...s })),
        conclusion: dto.conclusion,
        comments: dto.comments,
        submittedAt: new Date(),
      },
      include: { interviewer: { select: { id: true, name: true } } },
    });

    // 有人交了面评，这场面试就是真的发生过了——未排期（scheduledAt 为空）的场次靠时间扫不到，
    // 在这里收口，同时让同场其他面试官仍能看到提交入口。
    if (interview.status === 'SCHEDULED') {
      await this.prisma.interview.updateMany({
        where: { id: interviewId, status: 'SCHEDULED' },
        data: { status: 'COMPLETED' },
      });
    }

    await this.activityLog.record(
      user,
      ACTIVITY_ACTIONS.EVALUATION_SUBMITTED,
      'Application',
      interview.applicationId,
      {
        candidate: interview.application.candidate.name,
        round: interview.round,
        conclusion: dto.conclusion,
      },
    );
    return evaluation;
  }

  // ---------- 面试官可约时段 + 候选人自助选时 ----------

  /** 我的可约时段（面试官自维护，替代外部日历集成的低成本路径） */
  async mySlots(user: JwtUser) {
    return this.prisma.interviewerSlot.findMany({
      where: { userId: user.sub, endAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
    });
  }

  async addSlot(startAt: string, endAt: string, user: JwtUser) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (!(start < end)) throw new BadRequestException('结束时间必须晚于开始时间');
    if (start < new Date()) throw new BadRequestException('不能添加过去的时段');
    // 门户展示仅取结束时间 HH:mm，跨天会渲染成「23:00 - 01:00」的伪时段：按 +8 时区禁止跨天
    const dayOf = (d: Date) => Math.floor((d.getTime() + CN_TZ_OFFSET_MS) / 86_400_000);
    if (dayOf(start) !== dayOf(end)) {
      throw new BadRequestException('可约时段不能跨天，请拆分为多个时段');
    }
    const overlap = await this.prisma.interviewerSlot.findFirst({
      where: { userId: user.sub, startAt: { lt: end }, endAt: { gt: start } },
    });
    if (overlap) throw new ConflictException('与已有时段重叠');
    return this.prisma.interviewerSlot.create({
      data: { userId: user.sub, startAt: start, endAt: end },
    });
  }

  async removeSlot(id: string, user: JwtUser) {
    const slot = await this.prisma.interviewerSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('时段不存在');
    if (slot.userId !== user.sub) throw new ForbiddenException('仅可删除自己的时段');
    if (slot.bookedBy) throw new BadRequestException('该时段已被面试占用，请先与 HR 协调改期');
    await this.prisma.interviewerSlot.delete({ where: { id } });
    return { ok: true };
  }

  /** 生成候选人自助选时链接（未定时间的面试；重发复用同一令牌） */
  async selfScheduleLink(interviewId: string, user: JwtUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { application: { include: { candidate: { select: { name: true } } } } },
    });
    if (!interview) throw new NotFoundException('面试不存在');
    if (interview.scheduledAt) throw new BadRequestException('该面试已确定时间，如需改期请先取消原时间');

    let token = interview.portalToken;
    if (!token) {
      token = newPortalToken();
      await this.prisma.interview.update({ where: { id: interviewId }, data: { portalToken: token } });
    }
    return { token };
  }

  /** 候选人视角：可选时段 = 全部被指派面试官都空闲的时间窗（多面试官取重叠覆盖） */
  async portalView(token: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { portalToken: token },
      include: {
        interviewers: { include: { user: { select: { id: true, name: true } } } },
        application: {
          select: {
            candidate: { select: { name: true } },
            job: { select: { title: true } },
          },
        },
      },
    });
    if (!interview) throw new NotFoundException('链接无效或已失效，请联系 HR');

    const base = {
      company: 'ART 科技有限公司',
      candidateName: interview.application.candidate.name,
      jobTitle: interview.application.job.title,
      round: interview.round,
      durationMins: interview.durationMins ?? 60,
      scheduledAt: interview.scheduledAt,
      status: interview.status,
    };
    if (interview.scheduledAt) return { ...base, slots: [] };

    const interviewerIds = interview.interviewers.map((i) => i.user.id);
    const now = new Date();
    const slots = await this.prisma.interviewerSlot.findMany({
      where: { userId: { in: interviewerIds }, bookedBy: null, startAt: { gte: now } },
      orderBy: { startAt: 'asc' },
    });
    // 主时段取第一位面试官的空闲档；多面试官时要求其余面试官有覆盖该时间窗的空闲档
    const primary = slots.filter((s) => s.userId === interviewerIds[0]);
    const available = primary.filter((slot) =>
      interviewerIds.slice(1).every((uid) =>
        slots.some((o) => o.userId === uid && o.startAt <= slot.startAt && o.endAt >= slot.endAt),
      ),
    );
    return {
      ...base,
      slots: available.map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt })),
    };
  }

  /**
   * 候选人确认时段：写入条件二次校验（确认瞬间二次校验，冲突给替代时段），
   * 并发抢占返回 409，前端刷新剩余时段。
   */
  async portalPick(token: string, slotId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { portalToken: token },
      include: {
        interviewers: true,
        application: { select: { candidate: { select: { name: true } }, job: { select: { title: true } } } },
      },
    });
    if (!interview) throw new NotFoundException('链接无效或已失效，请联系 HR');
    if (interview.scheduledAt) throw new BadRequestException('该面试时间已确定');

    // slotId 必须归属本场面试的被指派面试官之一，防止跨面试劫持他人空闲时段
    const interviewerIds = interview.interviewers.map((i) => i.userId);
    const claimed = await this.prisma.interviewerSlot.updateMany({
      where: { id: slotId, bookedBy: null, userId: { in: interviewerIds } },
      data: { bookedBy: interview.id },
    });
    if (claimed.count === 0) {
      throw new ConflictException('该时段刚被约走，请从剩余时段中重新选择');
    }
    const slot = await this.prisma.interviewerSlot.findUniqueOrThrow({ where: { id: slotId } });
    await this.prisma.interview.update({
      where: { id: interview.id },
      data: { scheduledAt: slot.startAt, status: 'SCHEDULED' },
    });
    const actor = candidateActor(interview.application.candidate.name);
    await this.activityLog.record(actor, ACTIVITY_ACTIONS.INTERVIEW_SELF_SCHEDULED, 'Application', interview.applicationId, {
      candidate: interview.application.candidate.name,
      round: interview.round,
      scheduledAt: slot.startAt.toISOString(),
    });
    // 通知矩阵：面试确认 → 面试官 IM+日历（此处站内信），HR 站内
    await this.notifications.push(
      interview.interviewers.map((i) => i.userId),
      `候选人已确认面试时间：${interview.application.candidate.name}`,
      `${interview.application.job.title} · 第 ${interview.round} 轮 · ${slot.startAt.toLocaleString('zh-CN')}`,
      '/interviews',
    );
    await this.notifications.pushToRole(
      RoleCode.HR,
      `面试时间已敲定：${interview.application.candidate.name}`,
      `${interview.application.job.title} · 第 ${interview.round} 轮`,
      '/interviews',
    );
    return this.portalView(token);
  }
}
