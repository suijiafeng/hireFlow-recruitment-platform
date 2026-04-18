import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVITY_ACTIONS, DEFAULT_PIPELINE_STAGES } from '@hireflow/shared';
import { departmentScopeOf } from '../../common/data-scope';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { QueryJobsDto } from './dto/query-jobs.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { UpdateStagesDto } from './dto/update-stages.dto';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async list(query: QueryJobsDto, user?: JwtUser) {
    const { page = 1, pageSize = 20, keyword, status } = query;
    // 数据行级权限：用人经理仅本部门职位
    const deptScope = user ? departmentScopeOf(user) : null;
    const where: Prisma.JobWhereInput = {
      ...(keyword ? { title: { contains: keyword, mode: 'insensitive' } } : {}),
      ...(status ? { status } : {}),
      ...(deptScope ? { departmentId: deptScope } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
          hiringManager: { select: { id: true, name: true } },
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    // HC 占用：已入职 + 已接受 Offer 的在途者
    const usage = await this.prisma.application.groupBy({
      by: ['jobId'],
      where: {
        jobId: { in: items.map((j) => j.id) },
        OR: [{ status: 'HIRED' }, { status: 'ACTIVE', offer: { decision: 'ACCEPTED' } }],
      },
      _count: { _all: true },
    });
    const usageMap = new Map(usage.map((u) => [u.jobId, u._count._all]));
    return {
      total,
      page,
      pageSize,
      items: items.map((job) => ({ ...job, hcUsed: usageMap.get(job.id) ?? 0 })),
    };
  }

  /** HC 占用数：已入职 + 已接受 Offer 在途（预占/正式占用的简化口径） */
  async hcUsed(jobId: string): Promise<number> {
    return this.prisma.application.count({
      where: {
        jobId,
        OR: [{ status: 'HIRED' }, { status: 'ACTIVE', offer: { decision: 'ACCEPTED' } }],
      },
    });
  }

  /** 创建职位并生成默认 Pipeline 阶段（骨架期直接置为 OPEN，审批流三期接入） */
  async create(dto: CreateJobDto, user: JwtUser) {
    const job = await this.prisma.job.create({
      data: {
        title: dto.title,
        departmentId: dto.departmentId,
        hiringManagerId: dto.hiringManagerId,
        description: dto.description,
        requirement: dto.requirement,
        headcount: dto.headcount ?? 1,
        status: 'OPEN',
        createdById: user.sub,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((name, index) => ({ name, order: index })),
        },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.JOB_CREATED, 'Job', job.id, {
      title: job.title,
    });
    return job;
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        hiringManager: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        stages: { orderBy: { order: 'asc' }, include: { _count: { select: { applications: true } } } },
        _count: { select: { applications: true } },
      },
    });
    if (!job) throw new NotFoundException('职位不存在');
    return job;
  }

  async update(id: string, dto: UpdateJobDto, user: JwtUser) {
    await this.ensureExists(id);
    const job = await this.prisma.job.update({ where: { id }, data: dto });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.JOB_UPDATED, 'Job', id, { ...dto });
    return job;
  }

  async getStages(jobId: string) {
    await this.ensureExists(jobId);
    return this.prisma.pipelineStage.findMany({
      where: { jobId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { applications: true } } },
    });
  }

  /**
   * 全量更新职位的 Pipeline 阶段：
   * 传入有 id 的做改名/排序，无 id 的新增；未出现的阶段删除。
   */
  async updateStages(jobId: string, dto: UpdateStagesDto, user: JwtUser) {
    await this.ensureExists(jobId);
    const existing = await this.prisma.pipelineStage.findMany({ where: { jobId } });
    const existingIds = new Set(existing.map((s) => s.id));
    const incomingIds = new Set(dto.stages.filter((s) => s.id).map((s) => s.id as string));

    for (const item of dto.stages) {
      if (item.id && !existingIds.has(item.id)) {
        throw new BadRequestException(`阶段 ${item.id} 不属于该职位`);
      }
    }

    const toDelete = existing.filter((s) => !incomingIds.has(s.id));
    if (toDelete.length > 0) {
      const blocked = await this.prisma.application.count({
        where: { stageId: { in: toDelete.map((s) => s.id) } },
      });
      if (blocked > 0) {
        throw new BadRequestException('待删除的阶段中仍有候选人，请先移出后再删除');
      }
    }

    await this.prisma.$transaction([
      this.prisma.pipelineStage.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } }),
      ...dto.stages.map((item, index) =>
        item.id
          ? this.prisma.pipelineStage.update({
              where: { id: item.id },
              data: { name: item.name, order: index },
            })
          : this.prisma.pipelineStage.create({ data: { jobId, name: item.name, order: index } }),
      ),
    ]);

    await this.activityLog.record(user, ACTIVITY_ACTIONS.STAGES_UPDATED, 'Job', jobId, {
      stages: dto.stages.map((s) => s.name),
    });
    return this.getStages(jobId);
  }

  private async ensureExists(id: string) {
    const count = await this.prisma.job.count({ where: { id } });
    if (count === 0) throw new NotFoundException('职位不存在');
  }
}
