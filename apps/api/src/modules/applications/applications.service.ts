import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { MoveStageDto } from './dto/move-stage.dto';

const CARD_SELECT = {
  id: true,
  status: true,
  matchScore: true,
  position: true,
  createdAt: true,
  stageId: true,
  candidate: { select: { id: true, name: true, tags: true, source: true } },
} as const;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly ai: AiService,
  ) {}

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
        throw new ConflictException('该候选人已应聘此职位');
      }
      throw e;
    }
  }

  /** 看板数据：按阶段分组返回该职位全部流程中候选人 */
  async board(jobId: string) {
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

  /** 移动看板卡片 = 变更应聘阶段，并写入留痕 */
  async moveStage(id: string, dto: MoveStageDto, user: JwtUser) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { stage: true, candidate: { select: { name: true } } },
    });
    if (!application) throw new NotFoundException('应聘记录不存在');

    const targetStage = await this.prisma.pipelineStage.findUnique({ where: { id: dto.stageId } });
    if (!targetStage || targetStage.jobId !== application.jobId) {
      throw new BadRequestException('目标阶段不属于该职位');
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        stageId: targetStage.id,
        position: dto.position ?? (await this.nextPosition(targetStage.id)),
      },
      select: CARD_SELECT,
    });

    if (targetStage.id !== application.stageId) {
      await this.activityLog.record(
        user,
        ACTIVITY_ACTIONS.APPLICATION_STAGE_CHANGED,
        'Application',
        id,
        {
          candidate: application.candidate.name,
          from: application.stage.name,
          to: targetStage.name,
        },
      );
    }
    return updated;
  }

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
    const resumeText =
      resume?.rawText ??
      (resume?.parsed ? JSON.stringify(resume.parsed) : '') ??
      '';
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

  private async nextPosition(stageId: string): Promise<number> {
    const last = await this.prisma.application.aggregate({
      where: { stageId },
      _max: { position: true },
    });
    return (last._max.position ?? 0) + 1;
  }
}
