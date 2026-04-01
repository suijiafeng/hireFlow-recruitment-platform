import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACTIVITY_ACTIONS, PERMISSIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import type { Offer, Prisma } from '../../generated/prisma/client';
import { RoleCode } from '@hireflow/shared';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
import { ApplicationsService } from '../applications/applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalDto, CreateOfferDto, RespondDto } from './dto/create-offer.dto';

const OFFER_INCLUDE = {
  application: {
    select: {
      id: true,
      stageId: true,
      candidate: { select: { id: true, name: true, tags: true } },
      job: { select: { id: true, title: true, department: { select: { name: true } } } },
    },
  },
} satisfies Prisma.OfferInclude;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly ai: AiService,
    private readonly onboarding: OnboardingService,
    private readonly applications: ApplicationsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 薪资是敏感字段：无 salary:view 权限时整体抹除 */
  private maskSalary<T extends Partial<Offer>>(offer: T, user: JwtUser): T {
    if (user.permissions.includes(PERMISSIONS.SALARY_VIEW)) return offer;
    return { ...offer, salary: null };
  }

  private ensureCanRead(user: JwtUser) {
    const ok =
      user.permissions.includes(PERMISSIONS.OFFER_INITIATE) ||
      user.permissions.includes(PERMISSIONS.OFFER_APPROVE);
    if (!ok) throw new ForbiddenException('无权查看 Offer 数据');
  }

  async list(user: JwtUser) {
    this.ensureCanRead(user);
    const offers = await this.prisma.offer.findMany({
      include: OFFER_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return offers.map((o) => this.maskSalary(o, user));
  }

  /** 发起 Offer（HR）：直接进入待审批（生成 Offer → 走审批流） */
  async create(dto: CreateOfferDto, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: { candidate: true, job: true, offer: true },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');
    if (application.offer) throw new ConflictException('该应聘记录已存在 Offer');
    if (application.status !== 'ACTIVE') throw new BadRequestException('该应聘已不在流程中');

    const offer = await this.prisma.offer.create({
      data: {
        applicationId: dto.applicationId,
        salary: {
          base: dto.salaryBase,
          bonusMonths: dto.bonusMonths ?? 0,
          note: dto.note ?? null,
        },
        grade: dto.grade,
        approvalStatus: 'PENDING',
      },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.OFFER_INITIATED, 'Application', dto.applicationId, {
      candidate: application.candidate.name,
      job: application.job.title,
      grade: dto.grade ?? null,
    });
    // 通知矩阵：Offer 审批待办 → 用人经理
    if (application.job.hiringManagerId) {
      await this.notifications.push(
        [application.job.hiringManagerId],
        `Offer 待审批：${application.candidate.name}`,
        `${application.job.title} · 由 ${user.name} 发起`,
        '/offers',
      );
    }
    return this.maskSalary(offer, user);
  }

  /** 用人经理审批（HR 发起 / 用人经理审批） */
  async approve(id: string, dto: ApprovalDto, approve: boolean, user: JwtUser) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: OFFER_INCLUDE });
    if (!offer) throw new NotFoundException('Offer 不存在');
    if (offer.approvalStatus !== 'PENDING') {
      throw new BadRequestException(`当前状态（${offer.approvalStatus}）不可审批`);
    }
    const updated = await this.prisma.offer.update({
      where: { id },
      data: { approvalStatus: approve ? 'APPROVED' : 'REJECTED' },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(
      user,
      approve ? ACTIVITY_ACTIONS.OFFER_APPROVED : ACTIVITY_ACTIONS.OFFER_REJECTED,
      'Application',
      offer.applicationId,
      { candidate: offer.application.candidate.name, note: dto.note ?? null },
    );
    await this.notifications.pushToRole(
      RoleCode.HR,
      `Offer ${approve ? '审批通过' : '被驳回'}：${offer.application.candidate.name}`,
      `${offer.application.job.title} · ${user.name}${dto.note ? ` · ${dto.note}` : ''}`,
      '/offers',
    );
    return this.maskSalary(updated, user);
  }

  /** 电子发送 Offer（三期先模拟发送，邮件通道后续接入） */
  async send(id: string, user: JwtUser) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: OFFER_INCLUDE });
    if (!offer) throw new NotFoundException('Offer 不存在');
    if (offer.approvalStatus !== 'APPROVED') {
      throw new BadRequestException('仅已批准的 Offer 可发送');
    }
    const updated = await this.prisma.offer.update({
      where: { id },
      data: { approvalStatus: 'SENT', sentAt: new Date() },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.OFFER_SENT, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
    });
    return this.maskSalary(updated, user);
  }

  /**
   * 录入候选人答复。接受即触发自动化工作流：
   * 生成入职单（三方清单）+ 卡片自动移入「待入职」。
   */
  async respond(id: string, dto: RespondDto, user: JwtUser) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: OFFER_INCLUDE });
    if (!offer) throw new NotFoundException('Offer 不存在');
    if (offer.approvalStatus !== 'SENT') throw new BadRequestException('仅已发送的 Offer 可录入答复');
    if (offer.decision) throw new BadRequestException('该 Offer 已有答复');

    const updated = await this.prisma.offer.update({
      where: { id },
      data: { decision: dto.decision, respondedAt: new Date() },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.OFFER_RESPONDED, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
      decision: dto.decision,
    });

    if (dto.decision === 'ACCEPTED') {
      await this.onboarding.createForApplication(offer.applicationId, user);
      await this.applications.moveToStageByName(offer.applicationId, '待入职', user);
      await this.checkHeadcount(offer.application.job.id, user);
      await this.notifications.pushToRole(
        RoleCode.HR,
        `Offer 已接受：${offer.application.candidate.name}`,
        `${offer.application.job.title} · 入职单已自动创建`,
        '/onboarding',
      );
    } else {
      await this.prisma.application.update({
        where: { id: offer.applicationId },
        data: { status: 'WITHDRAWN', rejectReason: '拒绝 Offer' },
      });
      await this.notifications.pushToRole(
        RoleCode.HR,
        `Offer 被拒绝：${offer.application.candidate.name}`,
        `${offer.application.job.title} · 建议激活备选候选人`,
        '/offers',
      );
    }
    return this.maskSalary(updated, user);
  }

  /** HC 满编自动暂停职位，并通知 HR 与用人经理 */
  private async checkHeadcount(jobId: string, user: JwtUser) {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status !== 'OPEN') return;
    const used = await this.prisma.application.count({
      where: {
        jobId,
        OR: [{ status: 'HIRED' }, { status: 'ACTIVE', offer: { decision: 'ACCEPTED' } }],
      },
    });
    if (used < job.headcount) return;
    await this.prisma.job.update({ where: { id: jobId }, data: { status: 'PAUSED' } });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.JOB_UPDATED, 'Job', jobId, {
      auto: true,
      reason: `HC 已满（${used}/${job.headcount}），职位自动暂停`,
    });
    const notifyIds = job.hiringManagerId ? [job.hiringManagerId] : [];
    await this.notifications.push(
      notifyIds,
      `职位已满编自动暂停：${job.title}`,
      `HC ${used}/${job.headcount}，如需继续招聘请申请增编`,
      '/jobs',
    );
    await this.notifications.pushToRole(
      RoleCode.HR,
      `职位已满编自动暂停：${job.title}`,
      `HC ${used}/${job.headcount}`,
      '/jobs',
    );
  }

  /** AI 留存预测（辅助参考） */
  async retention(id: string, user: JwtUser) {
    this.ensureCanRead(user);
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: { include: { resumes: { orderBy: { createdAt: 'desc' }, take: 1 } } },
            job: true,
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer 不存在');
    const { candidate, job } = offer.application;
    const parsed = candidate.resumes[0]?.parsed as { summary?: string } | null;
    const { data, meta } = await this.ai.predictRetention({
      candidateName: candidate.name,
      jobTitle: job.title,
      tags: candidate.tags,
      matchScore: offer.application.matchScore,
      summary: parsed?.summary,
    });
    return { ...data, aiMeta: meta };
  }

}
