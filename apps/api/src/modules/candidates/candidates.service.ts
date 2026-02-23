import { Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS } from '@hireflow/shared';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
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
}
