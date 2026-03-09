import { Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
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
  ) {}

  /** 安排一场面试并指派面试官（二期接入日历协同后自动生成会议链接） */
  async create(dto: CreateInterviewDto, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');

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
    return interview;
  }

  /** 按应聘记录查询；不传 applicationId 时返回近期面试总览（面试管理页用） */
  async list(applicationId?: string) {
    if (applicationId) {
      return this.prisma.interview.findMany({
        where: { applicationId },
        include: INTERVIEW_INCLUDE,
        orderBy: { round: 'asc' },
      });
    }
    return this.prisma.interview.findMany({
      include: {
        ...INTERVIEW_INCLUDE,
        application: {
          select: {
            id: true,
            candidate: { select: { id: true, name: true } },
            job: { select: { id: true, title: true } },
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
          include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
        },
      },
    });
    if (!interview) throw new NotFoundException('面试不存在');

    const { data, meta } = await this.ai.draftEvaluation({
      candidateName: interview.application.candidate.name,
      jobTitle: interview.application.job.title,
      round: interview.round,
      notes,
    });
    return { ...data, aiMeta: meta };
  }

  /** 提交/更新面评（同一面试官对同一场面试仅一份，重复提交视为修订） */
  async submitEvaluation(interviewId: string, dto: SubmitEvaluationDto, user: JwtUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { application: { include: { candidate: { select: { name: true } } } } },
    });
    if (!interview) throw new NotFoundException('面试不存在');

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
}
