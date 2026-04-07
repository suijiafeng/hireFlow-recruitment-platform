import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVITY_ACTIONS,
  OFFER_DECLINE_REASONS,
  OFFER_VALID_BUSINESS_DAYS,
  PERMISSIONS,
  RoleCode,
} from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { addBusinessDays, candidateActor, newPortalToken } from '../../common/portal';
import type { Offer, Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
import { ApplicationsService } from '../applications/applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalDto, CreateOfferDto, ResubmitOfferDto, RespondDto } from './dto/create-offer.dto';

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

type OfferWithRelations = Prisma.OfferGetPayload<{ include: typeof OFFER_INCLUDE }>;

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
    // 懒过期扫描：无独立调度器（MVP），到期未答复的在读取时统一失效并通知
    const swept = await Promise.all(offers.map((o) => this.expireIfDue(o)));
    return swept.map((o) => this.maskSalary(o, user));
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

  /** 用人经理审批（HR 发起 / 用人经理审批）；驳回意见随 Offer 退回 HR */
  async approve(id: string, dto: ApprovalDto, approve: boolean, user: JwtUser) {
    const offer = await this.findOrThrow(id);
    if (offer.approvalStatus !== 'PENDING') {
      throw new BadRequestException(`当前状态（${offer.approvalStatus}）不可审批`);
    }
    if (!approve && !dto.note?.trim()) {
      throw new BadRequestException('驳回必须填写审批意见，供 HR 修改重提');
    }
    const updated = await this.prisma.offer.update({
      where: { id },
      data: { approvalStatus: approve ? 'APPROVED' : 'REJECTED', approvalNote: dto.note ?? null },
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

  /** 驳回后修改重提：更新薪资包 → 重新进入待审批 */
  async resubmit(id: string, dto: ResubmitOfferDto, user: JwtUser) {
    const offer = await this.findOrThrow(id);
    if (offer.approvalStatus !== 'REJECTED') {
      throw new BadRequestException('仅被驳回的 Offer 可修改重提');
    }
    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        salary: { base: dto.salaryBase, bonusMonths: dto.bonusMonths ?? 0, note: dto.note ?? null },
        grade: dto.grade,
        approvalStatus: 'PENDING',
        approvalNote: null, // 旧驳回意见已留痕于时间轴，字段清空避免误读
      },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.OFFER_RESUBMITTED, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
      grade: dto.grade ?? null,
      previousNote: offer.approvalNote,
    });
    const managerId = await this.hiringManagerOf(offer);
    if (managerId) {
      await this.notifications.push(
        [managerId],
        `Offer 修改重提待审批：${offer.application.candidate.name}`,
        `${offer.application.job.title} · 由 ${user.name} 重提`,
        '/offers',
      );
    }
    return this.maskSalary(updated, user);
  }

  /**
   * 电子发送 Offer（三期先模拟发送，邮件通道后续接入）：
   * 生成免登录门户令牌 + 答复截止时间（+5 个工作日）。
   */
  async send(id: string, user: JwtUser) {
    const offer = await this.findOrThrow(id);
    if (offer.approvalStatus !== 'APPROVED') {
      throw new BadRequestException('仅已批准的 Offer 可发送');
    }
    const expiresAt = addBusinessDays(new Date(), OFFER_VALID_BUSINESS_DAYS);
    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        approvalStatus: 'SENT',
        sentAt: new Date(),
        expiresAt,
        portalToken: offer.portalToken ?? newPortalToken(),
      },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.OFFER_SENT, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
      expiresAt: expiresAt.toISOString(),
    });
    return this.maskSalary(updated, user);
  }

  /** 续期一次：SENT/EXPIRED 未答复的 Offer 重新给 5 个工作日 */
  async extend(id: string, user: JwtUser) {
    let offer = await this.findOrThrow(id);
    offer = await this.expireIfDue(offer);
    if (offer.decision) throw new BadRequestException('该 Offer 已有答复，无需续期');
    if (offer.approvalStatus !== 'SENT' && offer.approvalStatus !== 'EXPIRED') {
      throw new BadRequestException('仅已发送/已失效的 Offer 可续期');
    }
    if (offer.extendedOnce) throw new BadRequestException('有效期仅可续期一次');

    const expiresAt = addBusinessDays(new Date(), OFFER_VALID_BUSINESS_DAYS);
    const updated = await this.prisma.offer.update({
      where: { id },
      data: { approvalStatus: 'SENT', expiresAt, extendedOnce: true },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.OFFER_EXTENDED, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
      until: expiresAt.toISOString(),
    });
    return this.maskSalary(updated, user);
  }

  /** 确保门户链接存在（发送前的旧数据补发令牌用），返回给前端拼 /portal/offer/:token */
  async ensurePortalToken(id: string, user: JwtUser) {
    let offer = await this.findOrThrow(id);
    offer = await this.expireIfDue(offer);
    if (offer.approvalStatus !== 'SENT' && offer.approvalStatus !== 'EXPIRED') {
      throw new BadRequestException('仅已发送的 Offer 有候选人链接');
    }
    if (!offer.portalToken) {
      offer = await this.prisma.offer.update({
        where: { id },
        data: {
          portalToken: newPortalToken(),
          expiresAt: offer.expiresAt ?? addBusinessDays(new Date(), OFFER_VALID_BUSINESS_DAYS),
        },
        include: OFFER_INCLUDE,
      });
    }
    return { token: offer.portalToken };
  }

  /** 录入候选人答复（HR 代录，如电话确认）。拒绝必选原因码。 */
  async respond(id: string, dto: RespondDto, user: JwtUser) {
    const { offer } = await this.applyDecision(id, dto.decision, dto.reason, user);
    return this.maskSalary(offer, user);
  }

  // ---------- 候选人免登录门户（H5 查看与答复） ----------

  /** 候选人视角的 Offer 内容（链接即凭证；发送前不暴露薪资细节） */
  async portalView(token: string) {
    let offer = await this.prisma.offer.findUnique({
      where: { portalToken: token },
      include: OFFER_INCLUDE,
    });
    if (!offer) throw new NotFoundException('链接无效或已失效，请联系 HR');
    offer = await this.expireIfDue(offer);

    const readable = offer.approvalStatus === 'SENT' || offer.approvalStatus === 'EXPIRED';
    const base = {
      company: 'ART 科技有限公司',
      candidateName: offer.application.candidate.name,
      jobTitle: offer.application.job.title,
      department: offer.application.job.department.name,
      status: offer.approvalStatus,
      decision: offer.decision,
      decisionReason: offer.decisionReason,
      respondedAt: offer.respondedAt,
      declineReasons: OFFER_DECLINE_REASONS,
    };
    if (!readable) {
      // 议价/重提中：老链接不展示已撤回的薪资方案
      return { ...base, preparing: true as const };
    }
    const onboardingPortalToken: string | null = null;
    return {
      ...base,
      preparing: false as const,
      salary: offer.salary,
      grade: offer.grade,
      sentAt: offer.sentAt,
      expiresAt: offer.expiresAt,
      extendedOnce: offer.extendedOnce,
      onboardingPortalToken,
    };
  }

  /** 候选人在门户上接受/拒绝 Offer（拒绝必选原因码） */
  async portalRespond(token: string, dto: RespondDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { portalToken: token },
      select: { id: true, application: { select: { candidate: { select: { name: true } } } } },
    });
    if (!offer) throw new NotFoundException('链接无效或已失效，请联系 HR');
    const actor = candidateActor(offer.application.candidate.name);
    await this.applyDecision(offer.id, dto.decision, dto.reason, actor);
    return this.portalView(token);
  }

  // ---------- 内部实现 ----------

  /**
   * 答复落库 + 自动化工作流，HR 代录与候选人门户共用：
   * 接受 → 生成入职单（三方清单 + 新员工门户令牌）+ 卡片自动移入「待入职」+ HC 满编检查；
   * 拒绝 → 应聘置为 WITHDRAWN（原因码留痕）+ 提示 HR 激活同职位备选候选人。
   */
  private async applyDecision(
    offerId: string,
    decision: 'ACCEPTED' | 'DECLINED',
    reason: string | undefined,
    actor: JwtUser,
  ) {
    let offer = await this.findOrThrow(offerId);
    offer = await this.expireIfDue(offer);
    if (offer.approvalStatus === 'EXPIRED') {
      throw new BadRequestException('该 Offer 已超过答复期失效，请联系 HR 续期后再答复');
    }
    if (offer.approvalStatus !== 'SENT') throw new BadRequestException('仅已发送的 Offer 可录入答复');
    if (offer.decision) throw new BadRequestException('该 Offer 已有答复');
    if (decision === 'DECLINED' && !reason?.trim()) {
      throw new BadRequestException('拒绝 Offer 必须选择原因码');
    }

    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        decision,
        respondedAt: new Date(),
        decisionReason: decision === 'DECLINED' ? reason : null,
      },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(actor, ACTIVITY_ACTIONS.OFFER_RESPONDED, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
      decision,
      reason: reason ?? null,
    });

    let onboardingPortalToken: string | null = null;
    if (decision === 'ACCEPTED') {
      await this.onboarding.createForApplication(offer.applicationId, actor);
      await this.applications.moveToStageByName(offer.applicationId, '待入职', actor);
      await this.checkHeadcount(offer.application.job.id, actor);
      await this.notifications.pushToRole(
        RoleCode.HR,
        `Offer 已接受：${offer.application.candidate.name}`,
        `${offer.application.job.title} · 入职单已自动创建，可发送资料收集链接`,
        '/onboarding',
      );
    } else {
      await this.prisma.application.update({
        where: { id: offer.applicationId },
        data: { status: 'WITHDRAWN', rejectReason: reason },
      });
      await this.activityLog.record(actor, ACTIVITY_ACTIONS.APPLICATION_WITHDRAWN, 'Application', offer.applicationId, {
        candidate: offer.application.candidate.name,
        job: offer.application.job.title,
        reason,
      });
      // 竞态止损：提示激活同职位仍在流程中的备选候选人
      const alternatives = await this.prisma.application.count({
        where: { jobId: offer.application.job.id, status: 'ACTIVE', id: { not: offer.applicationId } },
      });
      await this.notifications.pushToRole(
        RoleCode.HR,
        `Offer 被拒绝：${offer.application.candidate.name}（${reason}）`,
        alternatives > 0
          ? `${offer.application.job.title} · 该职位仍有 ${alternatives} 位流程中候选人，建议激活备选`
          : `${offer.application.job.title} · 该职位暂无其他流程中候选人，建议补充招聘`,
        '/offers',
      );
    }
    return { offer: updated, onboardingPortalToken };
  }

  /** 懒过期：SENT + 未答复 + 已过截止 → EXPIRED，通知 HR（状态迁移一次性，通知不会重复） */
  private async expireIfDue(offer: OfferWithRelations): Promise<OfferWithRelations> {
    if (
      offer.approvalStatus !== 'SENT' ||
      offer.decision !== null ||
      !offer.expiresAt ||
      offer.expiresAt.getTime() > Date.now()
    ) {
      return offer;
    }
    const updated = await this.prisma.offer.update({
      where: { id: offer.id },
      data: { approvalStatus: 'EXPIRED' },
      include: OFFER_INCLUDE,
    });
    await this.activityLog.record(null, ACTIVITY_ACTIONS.OFFER_EXPIRED, 'Application', offer.applicationId, {
      candidate: offer.application.candidate.name,
      expiresAt: offer.expiresAt.toISOString(),
    });
    await this.notifications.pushToRole(
      RoleCode.HR,
      `Offer 已失效：${offer.application.candidate.name}`,
      `${offer.application.job.title} · 超过答复期未答复${offer.extendedOnce ? '（已用过续期）' : '，可续期一次'}`,
      '/offers',
    );
    return updated;
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

  private async findOrThrow(id: string): Promise<OfferWithRelations> {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: OFFER_INCLUDE });
    if (!offer) throw new NotFoundException('Offer 不存在');
    return offer;
  }

  private async hiringManagerOf(offer: OfferWithRelations): Promise<string | null> {
    const job = await this.prisma.job.findUnique({
      where: { id: offer.application.job.id },
      select: { hiringManagerId: true },
    });
    return job?.hiringManagerId ?? null;
  }
}
