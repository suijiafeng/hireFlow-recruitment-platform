import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACTIVITY_ACTIONS, RoleCode } from '@hireflow/shared';
import { departmentScopeOf } from '../../common/data-scope';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { candidateActor, newPortalToken } from '../../common/portal';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { BatchMoveDto, BatchRejectDto, MoveStageDto, RejectApplicationDto } from './dto/move-stage.dto';

/** 批量操作结果：部分失败不回滚（错误报告模式） */
export interface BatchResult {
  total: number;
  succeeded: number;
  failed: Array<{ id: string; candidate: string | null; error: string }>;
}

const CARD_SELECT = {
  id: true,
  status: true,
  matchScore: true,
  position: true,
  createdAt: true,
  stageId: true,
  stageEnteredAt: true,
  version: true,
  candidate: { select: { id: true, name: true, tags: true, source: true } },
} as const;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * AI 岗位匹配度评分：JD × 简历 → 分数 + 可解释报告，回写应聘记录。
   */
  async score(id: string, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        job: true,
        candidate: { include: { resumes: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');

    const resume = application.candidate.resumes[0];
    const resumeText = resume?.rawText ?? (resume?.parsed ? JSON.stringify(resume.parsed) : '');
    if (!resumeText && application.candidate.tags.length === 0) {
      throw new BadRequestException('该候选人暂无简历或标签，无法评分，请先导入简历');
    }

    const { data, meta } = await this.ai.scoreMatch({
      jobTitle: application.job.title,
      jobDescription: application.job.description ?? '',
      jobRequirement: application.job.requirement ?? '',
      resumeText,
      candidateTags: application.candidate.tags,
    });

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        matchScore: data.score,
        matchReport: { ...data, aiMeta: meta } as unknown as Prisma.InputJsonValue,
      },
      select: { ...CARD_SELECT, matchReport: true },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.APPLICATION_SCORED, 'Application', id, {
      candidate: application.candidate.name,
      job: application.job.title,
      score: data.score,
      provider: meta.provider,
    });
    return { ...updated, aiMeta: meta };
  }

  /** 创建应聘记录（候选人投递/HR 导入），进入指定或默认首个阶段 */
  async create(dto: CreateApplicationDto, user: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!job) throw new NotFoundException('职位不存在');
    if (job.stages.length === 0) throw new BadRequestException('该职位尚未配置 Pipeline 阶段');

    const stage = dto.stageId
      ? job.stages.find((s) => s.id === dto.stageId)
      : job.stages[0];
    if (!stage) throw new BadRequestException('目标阶段不属于该职位');

    const candidate = await this.prisma.candidate.findUnique({ where: { id: dto.candidateId } });
    if (!candidate) throw new NotFoundException('候选人不存在');

    try {
      const application = await this.prisma.application.create({
        data: {
          candidateId: dto.candidateId,
          jobId: dto.jobId,
          stageId: stage.id,
          position: await this.nextPosition(stage.id),
        },
        select: CARD_SELECT,
      });
      await this.activityLog.record(
        user,
        ACTIVITY_ACTIONS.APPLICATION_CREATED,
        'Application',
        application.id,
        { candidate: candidate.name, job: job.title, stage: stage.name },
      );
      return application;
    } catch (e: unknown) {
      // P2002 = 唯一约束冲突（candidateId + jobId）
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        // 重复投递不静默丢弃：在原应聘时间轴留痕
        const existing = await this.prisma.application.findUnique({
          where: { candidateId_jobId: { candidateId: dto.candidateId, jobId: dto.jobId } },
          select: { id: true, status: true },
        });
        if (existing) {
          await this.activityLog.record(user, ACTIVITY_ACTIONS.APPLICATION_REAPPLIED, 'Application', existing.id, {
            candidate: candidate.name,
            job: job.title,
            existingStatus: existing.status,
          });
        }
        throw new ConflictException('该候选人已应聘此职位（重复投递已记录到原应聘时间轴）');
      }
      throw e;
    }
  }

  /** 看板数据：按阶段分组返回该职位全部流程中候选人 */
  async board(jobId: string, user?: JwtUser) {
    // 数据行级权限：用人经理仅可打开本部门职位的看板
    if (user) {
      const deptScope = departmentScopeOf(user);
      if (deptScope) {
        const owned = await this.prisma.job.findFirst({
          where: { id: jobId, departmentId: deptScope },
          select: { id: true },
        });
        if (!owned) throw new ForbiddenException('仅可查看本部门职位的看板（数据范围：本部门）');
      }
    }
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            applications: {
              where: { status: 'ACTIVE' },
              orderBy: { position: 'asc' },
              select: CARD_SELECT,
            },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('职位不存在');
    return {
      job: { id: job.id, title: job.title, status: job.status },
      columns: job.stages.map((stage) => ({
        stage: { id: stage.id, name: stage.name, order: stage.order },
        applications: stage.applications,
      })),
    };
  }

  /**
   * 移动看板卡片 = 变更应聘阶段（状态迁移规则）：
   * 终态不可移动；回退必填原因；乐观锁防并发；stageEnteredAt 重置支撑停留时长统计。
   */
  async moveStage(id: string, dto: MoveStageDto, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { stage: true, candidate: { select: { name: true } } },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');
    if (application.status !== 'ACTIVE') {
      throw new BadRequestException('已淘汰/已入职的应聘记录不可再流转（终态不可逆，可重新激活生成新应聘）');
    }
    if (dto.expectedVersion != null && dto.expectedVersion !== application.version) {
      throw new ConflictException('该卡片刚被他人移动过，看板已刷新，请确认后重试');
    }

    const targetStage = await this.prisma.pipelineStage.findUnique({ where: { id: dto.stageId } });
    if (!targetStage || targetStage.jobId !== application.jobId) {
      throw new BadRequestException('目标阶段不属于该职位');
    }

    const isBackward = targetStage.order < application.stage.order;
    if (isBackward && !dto.reason?.trim()) {
      throw new BadRequestException('回退阶段必须填写原因（受控回退）');
    }
    // 自动化接管列拦截：终段列由业务事件驱动，手动拖入需实体状态背书，
    // 否则看板列与实体状态脱钩、漏斗虚报（状态强校验，拒绝非法流转）
    if (!isBackward && targetStage.name === '待入职') {
      const offer = await this.prisma.offer.findUnique({
        where: { applicationId: id },
        select: { decision: true },
      });
      if (offer?.decision !== 'ACCEPTED') {
        throw new BadRequestException(
          '「待入职」由候选人接受 Offer 后自动流转：请先在录用管理中完成 Offer 发送与答复',
        );
      }
    }
    if (!isBackward && targetStage.name === '已入职') {
      const onboarding = await this.prisma.onboarding.findUnique({
        where: { applicationId: id },
        select: { status: true },
      });
      if (onboarding?.status !== 'COMPLETED') {
        throw new BadRequestException(
          '「已入职」由入职闭环自动流转（三方清单完成 + 合同签署），不可手动拖入',
        );
      }
    }

    // 无位移的拖回原列：不写库、不加版本，直接返回当前卡片
    if (targetStage.id === application.stageId) {
      return this.prisma.application.findUniqueOrThrow({ where: { id }, select: CARD_SELECT });
    }

    // 乐观锁落到写入条件里：读-写窗口内被他人抢先移动时，本次更新影响 0 行 → 409
    const result = await this.prisma.application.updateMany({
      where: {
        id,
        status: 'ACTIVE',
        ...(dto.expectedVersion != null ? { version: dto.expectedVersion } : {}),
      },
      data: {
        stageId: targetStage.id,
        position: dto.position ?? (await this.nextPosition(targetStage.id)),
        stageEnteredAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('该卡片刚被他人移动过，看板已刷新，请确认后重试');
    }

    await this.activityLog.record(
      user,
      isBackward ? ACTIVITY_ACTIONS.APPLICATION_STAGE_REVERTED : ACTIVITY_ACTIONS.APPLICATION_STAGE_CHANGED,
      'Application',
      id,
      {
        candidate: application.candidate.name,
        from: application.stage.name,
        to: targetStage.name,
        ...(isBackward ? { reason: dto.reason } : {}),
      },
    );
    return this.prisma.application.findUniqueOrThrow({ where: { id }, select: CARD_SELECT });
  }

  /** 淘汰：原因码强制，终态 + 留痕（感谢信通道接入后在此触发延迟发送） */
  async reject(id: string, dto: RejectApplicationDto, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');
    if (application.status !== 'ACTIVE') throw new BadRequestException('该应聘已不在流程中');

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: dto.reason,
        version: { increment: 1 },
      },
      select: { ...CARD_SELECT, rejectReason: true },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.APPLICATION_REJECTED, 'Application', id, {
      candidate: application.candidate.name,
      job: application.job.title,
      reason: dto.reason,
      note: dto.note ?? null,
    });
    return updated;
  }

  /**
   * 批量淘汰：逐条复用单卡守卫（终态检查/原因码/留痕），
   * 部分失败不回滚，返回成败明细供前端展示错误报告。
   */
  async batchReject(dto: BatchRejectDto, user: JwtUser): Promise<BatchResult> {
    return this.runBatch(dto.ids, (id) => this.reject(id, { reason: dto.reason, note: dto.note }, user));
  }

  /** 批量移动阶段：逐条复用 moveStage 全部守卫（同职位/回退原因/自动化接管列拦截/乐观锁） */
  async batchMove(dto: BatchMoveDto, user: JwtUser): Promise<BatchResult> {
    return this.runBatch(dto.ids, (id) =>
      this.moveStage(id, { stageId: dto.stageId, reason: dto.reason }, user),
    );
  }

  /**
   * 候选人对比（2-4 人并排 + AI 综合对比意见）。
   * 数据（匹配分/标签/面评）与 AI 意见分开返回：AI 永远是辅助，终审权在用人经理。
   */
  async compare(ids: string[], user: JwtUser) {
    const unique = [...new Set(ids)];
    if (unique.length < 2 || unique.length > 4) {
      throw new BadRequestException('对比需选择 2-4 位候选人');
    }
    const apps = await this.prisma.application.findMany({
      where: { id: { in: unique } },
      include: {
        candidate: { select: { id: true, name: true, tags: true, source: true } },
        job: { select: { id: true, title: true } },
        interviews: {
          include: {
            evaluations: {
              where: { submittedAt: { not: null } },
              select: { conclusion: true, comments: true, scorecard: true },
            },
          },
        },
      },
    });
    if (apps.length !== unique.length) throw new NotFoundException('部分应聘记录不存在');
    if (new Set(apps.map((a) => a.jobId)).size > 1) {
      throw new BadRequestException('仅支持同一职位内的候选人对比');
    }

    const candidates = apps.map((a) => {
      const evaluations = a.interviews
        .flatMap((iv) => iv.evaluations)
        .map((ev) => {
          const sc = ev.scorecard as Array<{ score: number }> | null;
          const avg = sc?.length ? sc.reduce((s, x) => s + x.score, 0) / sc.length : null;
          return {
            conclusion: ev.conclusion,
            avgScore: avg != null ? Math.round(avg * 10) / 10 : null,
            comments: ev.comments,
          };
        });
      const report = a.matchReport as { highlights?: string; risks?: string } | null;
      return {
        applicationId: a.id,
        name: a.candidate.name,
        matchScore: a.matchScore,
        tags: a.candidate.tags,
        highlights: report?.highlights ?? null,
        risks: report?.risks ?? null,
        evaluations,
      };
    });

    const { data, meta } = await this.ai.compareCandidates({
      jobTitle: apps[0].job.title,
      candidates: candidates.map(({ applicationId: _id, ...rest }) => rest),
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.CANDIDATES_COMPARED, 'Job', apps[0].job.id, {
      job: apps[0].job.title,
      candidates: candidates.map((c) => c.name),
    });
    return { jobTitle: apps[0].job.title, candidates, ai: data, aiMeta: meta };
  }

  // ---------- AI 预筛机器人（邀约前自动核实硬性条件） ----------

  /** 生成/复用预筛链接（HR 发给候选人，token 即凭证） */
  async sendPrescreen(id: string, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');
    if (application.status !== 'ACTIVE') throw new BadRequestException('该应聘已不在流程中');

    let token = application.prescreenToken;
    if (!token) {
      token = newPortalToken();
      await this.prisma.application.update({ where: { id }, data: { prescreenToken: token } });
      await this.activityLog.record(user, ACTIVITY_ACTIONS.PRESCREEN_SENT, 'Application', id, {
        candidate: application.candidate.name,
        job: application.job.title,
      });
    }
    return { token };
  }

  /** 候选人视角的预筛页（@Public） */
  async prescreenView(token: string) {
    const application = await this.prisma.application.findUnique({
      where: { prescreenToken: token },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
    });
    if (!application) throw new NotFoundException('链接无效或已失效，请联系 HR');
    return {
      company: 'ART 科技有限公司',
      candidateName: application.candidate.name,
      jobTitle: application.job.title,
      prescreen: application.prescreen,
    };
  }

  /**
   * 候选人提交预筛三问（薪资/到岗/出差）。硬性条件核验（不符拦截）：
   * 期望薪资超过该职位已发 Offer 最高 base 的 120% → 标记；到岗超 60 天 → 标记；不接受出差 → 标记。
   * 标记不自动淘汰（AI/规则永不直接淘汰人），推送 HR 人工判断。
   */
  async prescreenSubmit(
    token: string,
    dto: { expectedSalary: number; availableDate: string; travelOk: boolean; note?: string },
  ) {
    const application = await this.prisma.application.findUnique({
      where: { prescreenToken: token },
      include: { candidate: { select: { name: true } }, job: { select: { id: true, title: true } } },
    });
    if (!application) throw new NotFoundException('链接无效或已失效，请联系 HR');
    if (application.prescreen) throw new BadRequestException('预筛信息已提交过，如需更正请联系 HR');

    const flags: string[] = [];
    const topOffer = await this.prisma.offer.findFirst({
      where: { application: { jobId: application.job.id }, sentAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { salary: true },
    });
    const band = (topOffer?.salary as { base?: number } | null)?.base;
    if (band && dto.expectedSalary > band * 1.2) {
      flags.push(`期望薪资 ¥${dto.expectedSalary} 超出该职位近期 Offer 水平（¥${band}）20% 以上`);
    }
    const days = (new Date(dto.availableDate).getTime() - Date.now()) / 86_400_000;
    if (Number.isFinite(days) && days > 60) flags.push('最早到岗时间超过 60 天');
    if (!dto.travelOk) flags.push('不接受出差安排');

    const prescreen = {
      expectedSalary: dto.expectedSalary,
      availableDate: dto.availableDate,
      travelOk: dto.travelOk,
      note: dto.note ?? null,
      flags,
      submittedAt: new Date().toISOString(),
    };
    await this.prisma.application.update({
      where: { id: application.id },
      data: { prescreen: prescreen as unknown as Prisma.InputJsonValue },
    });
    const actor = candidateActor(application.candidate.name);
    await this.activityLog.record(actor, ACTIVITY_ACTIONS.PRESCREEN_SUBMITTED, 'Application', application.id, {
      candidate: application.candidate.name,
      flags,
    });
    await this.notifications.pushToRole(
      RoleCode.HR,
      flags.length
        ? `预筛存在不符项：${application.candidate.name}`
        : `预筛已回收：${application.candidate.name}`,
      flags.length
        ? `${application.job.title} · ${flags.join('；')} · 请人工判断是否继续邀约`
        : `${application.job.title} · 硬性条件均符合，可安排邀约`,
      '/pipeline',
    );
    return this.prescreenView(token);
  }

  /** 顺序执行保证列内 position 分配与留痕顺序稳定；单次上限已由 DTO 约束（≤100） */
  private async runBatch(ids: string[], op: (id: string) => Promise<unknown>): Promise<BatchResult> {
    const uniqueIds = [...new Set(ids)];
    const failed: BatchResult['failed'] = [];
    let succeeded = 0;
    for (const id of uniqueIds) {
      try {
        await op(id);
        succeeded += 1;
      } catch (error) {
        const candidate = await this.prisma.application
          .findUnique({ where: { id }, select: { candidate: { select: { name: true } } } })
          .then((a) => a?.candidate.name ?? null)
          .catch(() => null);
        failed.push({
          id,
          candidate,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    }
    return { total: uniqueIds.length, succeeded, failed };
  }

  /** 按阶段名称自动移卡（自动化工作流用：发起 Offer→Offer、接受→待入职、签约→已入职）；阶段不存在或需回退则跳过 */
  async moveToStageByName(applicationId: string, stageName: string, user: JwtUser) {
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { stage: true, candidate: { select: { name: true } } },
    });
    const target = await this.prisma.pipelineStage.findFirst({
      where: { jobId: application.jobId, name: stageName },
    });
    if (!target || target.id === application.stageId) return;
    // 自动化只向前推进：卡片已越过目标列时不回拖（如已在待入职时补发 Offer 事件）
    if (target.order < application.stage.order) return;
    await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        stageId: target.id,
        position: await this.nextPosition(target.id),
        // 与手动移卡保持一致：重置停留时长起点并递增乐观锁版本，否则自动流转后统计与并发校验失真
        stageEnteredAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.activityLog.record(
      user,
      ACTIVITY_ACTIONS.APPLICATION_STAGE_CHANGED,
      'Application',
      applicationId,
      { candidate: application.candidate.name, from: application.stage.name, to: stageName, auto: true },
    );
  }

  private async nextPosition(stageId: string): Promise<number> {
    const last = await this.prisma.application.aggregate({
      where: { stageId },
      _max: { position: true },
    });
    return (last._max.position ?? 0) + 1;
  }
}
