import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AddResumeDto } from './dto/add-resume.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly ai: AiService,
  ) {}

  async list(query: QueryCandidatesDto) {
    const { page = 1, pageSize = 20, keyword } = query;
    const where: Prisma.CandidateWhereInput = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { email: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword } },
            { tags: { has: keyword } },
          ],
        }
      : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        include: {
          applications: {
            include: {
              job: { select: { id: true, title: true } },
              stage: { select: { id: true, name: true } },
            },
          },
          _count: { select: { resumes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async create(dto: CreateCandidateDto, user: JwtUser) {
    const candidate = await this.prisma.candidate.create({
      data: { ...dto, tags: dto.tags ?? [] },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.CANDIDATE_CREATED, 'Candidate', candidate.id, {
      name: candidate.name,
      source: candidate.source,
    });
    return candidate;
  }

  /** 360° 候选人详情：结构化信息 + 应聘记录 + 时间轴 */
  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        resumes: { orderBy: { createdAt: 'desc' } },
        applications: {
          include: {
            job: { select: { id: true, title: true } },
            stage: { select: { id: true, name: true } },
            interviews: {
              include: {
                interviewers: { include: { user: { select: { id: true, name: true } } } },
                evaluations: {
                  include: { interviewer: { select: { id: true, name: true } } },
                },
              },
              orderBy: { round: 'asc' },
            },
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException('候选人不存在');

    // 时间轴聚合：候选人自身 + 其所有应聘记录的留痕
    const applicationIds = candidate.applications.map((a) => a.id);
    const timeline = await this.prisma.activityLog.findMany({
      where: {
        OR: [
          { entityType: 'Candidate', entityId: id },
          ...(applicationIds.length > 0
            ? [{ entityType: 'Application', entityId: { in: applicationIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, name: true } } },
    });

    return { ...candidate, timeline };
  }

  async update(id: string, dto: Partial<CreateCandidateDto>, user: JwtUser) {
    const exists = await this.prisma.candidate.count({ where: { id } });
    if (exists === 0) throw new NotFoundException('候选人不存在');
    const candidate = await this.prisma.candidate.update({ where: { id }, data: dto });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.CANDIDATE_UPDATED, 'Candidate', id, {
      ...dto,
    });
    return candidate;
  }

  /**
   * AI 解析简历：结构化抽取 + 语义技能标签 + 150 字亮点风险摘要，标签合并进候选人。
   */
  async parseResume(resumeId: string, user: JwtUser) {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      include: { candidate: true },
    });
    if (!resume) throw new NotFoundException('简历不存在');
    if (!resume.rawText) throw new BadRequestException('该简历没有可解析的文本内容');

    await this.prisma.resume.update({ where: { id: resumeId }, data: { parseStatus: 'PARSING' } });
    try {
      const { data, meta } = await this.ai.parseResume(resume.rawText);
      const mergedTags = [...new Set([...resume.candidate.tags, ...data.skills])].slice(0, 15);

      const [updatedResume] = await this.prisma.$transaction([
        this.prisma.resume.update({
          where: { id: resumeId },
          data: {
            parsed: { ...data, aiMeta: meta } as unknown as Prisma.InputJsonValue,
            skills: data.skills,
            parseStatus: 'DONE',
          },
        }),
        this.prisma.candidate.update({
          where: { id: resume.candidateId },
          data: { tags: mergedTags },
        }),
      ]);
      await this.activityLog.record(user, ACTIVITY_ACTIONS.RESUME_PARSED, 'Candidate', resume.candidateId, {
        resumeId,
        provider: meta.provider,
        skills: data.skills,
      });
      return { ...updatedResume, aiMeta: meta };
    } catch (error) {
      await this.prisma.resume.update({ where: { id: resumeId }, data: { parseStatus: 'FAILED' } });
      throw error;
    }
  }

  /** 文本导入一份简历（导入后可调用 /resumes/:id/parse 做 AI 解析） */
  async addResume(candidateId: string, dto: AddResumeDto, user: JwtUser) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('候选人不存在');
    const resume = await this.prisma.resume.create({
      data: {
        candidateId,
        rawText: dto.rawText,
        fileName: dto.fileName ?? `${candidate.name}-简历.txt`,
        parseStatus: 'PENDING',
      },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.RESUME_ADDED, 'Candidate', candidateId, {
      resumeId: resume.id,
      fileName: resume.fileName,
      length: dto.rawText.length,
    });
    return resume;
  }
}
