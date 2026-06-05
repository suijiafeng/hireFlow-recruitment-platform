import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVITY_ACTIONS,
  DEFAULT_ONBOARDING_CHECKLIST,
  DOCUMENT_TYPE_META,
  PERMISSIONS,
  RoleCode,
  type DocumentType,
} from '@hireflow/shared';
import { departmentScopeOf } from '../../common/data-scope';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { candidateActor, CN_TZ_OFFSET_MS, newPortalToken } from '../../common/portal';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApplicationsService } from '../applications/applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AddDocumentDto } from './dto/onboarding.dto';
import { MockEsignProvider, type EsignProvider } from './providers/esign.provider';
import { MockOcrProvider, type OcrProvider } from './providers/ocr.provider';
import { WebhookService } from './providers/webhook.service';

export interface ChecklistItem {
  key: string;
  label: string;
  owner: 'HR' | 'IT' | 'NEW_HIRE';
  done: boolean;
  doneAt: string | null;
}

interface DocumentRecord {
  type: DocumentType;
  label: string;
  fields: Record<string, string>;
  addedAt: string;
  ocrProvider: string;
  fileKey?: string | null; // 原件对象存储 key（拍照上传）
  fileName?: string | null;
  needsReview?: boolean; // 未识别出字段（如只传图片）：待人工核对，不自动勾选待办
}

const ONBOARDING_INCLUDE = {
  application: {
    select: {
      id: true,
      candidate: { select: { id: true, name: true, phone: true, email: true } },
      job: { select: { id: true, title: true, department: { select: { name: true } } } },
    },
  },
  contract: true,
} satisfies Prisma.OnboardingInclude;

@Injectable()
export class OnboardingService {
  // 可插拔服务商：接真实电子签/OCR 时替换实现即可
  private readonly esign: EsignProvider = new MockEsignProvider();
  private readonly ocr: OcrProvider = new MockOcrProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly applications: ApplicationsService,
    private readonly webhook: WebhookService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Offer 接受后自动创建入职单 */
  async createForApplication(applicationId: string, user: JwtUser) {
    const existing = await this.prisma.onboarding.findUnique({ where: { applicationId } });
    if (existing) return existing;

    const checklist: ChecklistItem[] = DEFAULT_ONBOARDING_CHECKLIST.map((item) => ({
      ...item,
      done: false,
      doneAt: null,
    }));
    const onboarding = await this.prisma.onboarding.create({
      data: {
        applicationId,
        status: 'IN_PROGRESS',
        checklist: checklist as unknown as Prisma.InputJsonValue,
        documents: [] as unknown as Prisma.InputJsonValue,
        portalToken: newPortalToken(), // 新员工免登录 H5 资料收集入口
      },
      include: ONBOARDING_INCLUDE,
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.ONBOARDING_CREATED, 'Application', applicationId, {
      candidate: onboarding.application.candidate.name,
      checklistCount: checklist.length,
    });
    await this.webhook.fire(
      'onboarding.created',
      applicationId,
      { candidate: onboarding.application.candidate.name, job: onboarding.application.job.title },
      user,
    );
    return onboarding;
  }

  /**
   * 合同变量内嵌薪资（salaryBase/bonusMonths）：对无 salary:view 的内部用户抹除，
   * 堵住绕过 Offer 接口脱敏的旁路（「查看薪资字段」权限）。
   * 门户候选人看自己的合同不走此方法（portalView），矩阵允许 △自己Offer。
   */
  private maskContractSalary<T extends { contract: { variables: Prisma.JsonValue } | null }>(
    onboarding: T,
    user?: JwtUser,
  ): T {
    if (!user || user.permissions.includes(PERMISSIONS.SALARY_VIEW)) return onboarding;
    if (!onboarding.contract?.variables || typeof onboarding.contract.variables !== 'object') {
      return onboarding;
    }
    const vars = { ...(onboarding.contract.variables as Record<string, unknown>) };
    delete vars.salaryBase;
    delete vars.bonusMonths;
    return {
      ...onboarding,
      contract: {
        ...onboarding.contract,
        variables: { ...vars, salaryMasked: true } as Prisma.JsonValue,
      },
    };
  }

  /** 材料列表补预签名预览链接（原件在对象存储；无文件/存储不可用时 fileUrl=null） */
  private async withDocUrls<T extends { documents: Prisma.JsonValue }>(onboarding: T): Promise<T> {
    const docs = (onboarding.documents as unknown as DocumentRecord[] | null) ?? [];
    const enriched = await Promise.all(
      docs.map(async (d) => ({
        ...d,
        fileUrl: await this.storage.tryPresignedGetUrl(d.fileKey, d.fileName ?? undefined),
      })),
    );
    return { ...onboarding, documents: enriched as unknown as Prisma.JsonValue };
  }

  async list(user?: JwtUser) {
    // 数据行级权限：用人经理仅本部门职位的入职单
    const deptScope = user ? departmentScopeOf(user) : null;
    const items = await this.prisma.onboarding.findMany({
      where: deptScope ? { application: { job: { departmentId: deptScope } } } : undefined,
      include: ONBOARDING_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(
      items.map(async (o) => ({
        ...(await this.withDocUrls(this.maskContractSalary(o, user))),
        progress: this.progressOf(o.checklist),
      })),
    );
  }

  async get(id: string, user?: JwtUser) {
    const onboarding = await this.prisma.onboarding.findUnique({
      where: { id },
      include: ONBOARDING_INCLUDE,
    });
    if (!onboarding) throw new NotFoundException('入职单不存在');
    // 数据行级权限：与 list() 同规则，用人经理仅本部门职位的入职单
    const deptScope = user ? departmentScopeOf(user) : null;
    if (deptScope) {
      const owned = await this.prisma.job.findFirst({
        where: { id: onboarding.application.job.id, departmentId: deptScope },
        select: { id: true },
      });
      if (!owned) throw new ForbiddenException('仅可查看本部门的入职单（数据范围：本部门）');
    }
    return {
      ...(await this.withDocUrls(this.maskContractSalary(onboarding, user))),
      progress: this.progressOf(onboarding.checklist),
    };
  }

  /**
   * 勾选/取消三方待办（HR / IT / 新员工，进度可视）。
   * 勾选范围按角色约束：ONBOARDING_MANAGE 全量；
   * IT 仅 owner=IT；新员工（含门户候选人身份）仅 owner=NEW_HIRE。
   */
  async toggleItem(id: string, key: string, done: boolean, user: JwtUser) {
    const onboarding = await this.get(id);
    if (onboarding.status === 'COMPLETED') {
      throw new BadRequestException('入职已闭环（候选人已 HIRED），清单不可再修改');
    }
    const checklist = onboarding.checklist as unknown as ChecklistItem[];
    const item = checklist.find((i) => i.key === key);
    if (!item) throw new NotFoundException('清单项不存在');
    this.assertCanToggle(user, item);
    item.done = done;
    item.doneAt = done ? new Date().toISOString() : null;

    await this.prisma.onboarding.update({
      where: { id },
      data: { checklist: checklist as unknown as Prisma.InputJsonValue },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.ONBOARDING_ITEM_DONE, 'Application', onboarding.applicationId, {
      item: item.label,
      done,
    });
    await this.completeIfReady(id, user);
    return this.get(id, user);
  }

  /**
   * 收集入职材料：图片原件入对象存储留档；文字层走 OCR 抽取字段并自动勾选对应待办；
   * 只有图片没有可识别字段时标记「待人工核对」，不自动流转并通知 HR（低置信度阻断）。
   */
  async addDocument(id: string, dto: AddDocumentDto, user: JwtUser, file?: Express.Multer.File) {
    const onboarding = await this.get(id);
    if (onboarding.status === 'COMPLETED') {
      throw new BadRequestException('入职已闭环，材料不可再变更（如需更正请联系管理员）');
    }
    const meta = DOCUMENT_TYPE_META[dto.type];

    let fileKey: string | null = null;
    let fileName: string | null = null;
    if (file) {
      fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      fileKey = this.storage.objectKey(`onboarding/${id}/${dto.type}`, fileName);
      await this.storage.put(fileKey, file.buffer, file.mimetype);
    }

    const fields = dto.rawText ? await this.ocr.parse(dto.type, dto.rawText) : {};
    if (!file && Object.keys(fields).length === 0) {
      throw new BadRequestException('未能从材料中识别出关键字段，请检查内容');
    }
    const needsReview = Object.keys(fields).length === 0;

    const documents = (onboarding.documents as unknown as DocumentRecord[] | null) ?? [];
    const record: DocumentRecord = {
      type: dto.type,
      label: meta.label,
      fields,
      addedAt: new Date().toISOString(),
      ocrProvider: this.ocr.name,
      fileKey,
      fileName,
      needsReview,
    };
    const next = [...documents.filter((d) => d.type !== dto.type), record];

    await this.prisma.onboarding.update({
      where: { id },
      data: { documents: next as unknown as Prisma.InputJsonValue },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.DOCUMENT_ADDED, 'Application', onboarding.applicationId, {
      type: meta.label,
      fields: Object.keys(fields),
      provider: this.ocr.name,
      file: fileName,
      needsReview,
    });

    if (needsReview) {
      // 低置信度不自动流转，强提示 HR 人工核对
      await this.notifications.pushToRole(
        RoleCode.HR,
        `入职材料待人工核对：${onboarding.application.candidate.name}`,
        `「${meta.label}」仅上传了图片、未识别出字段，请核对后手动勾选对应待办`,
        '/onboarding',
      );
    } else {
      // 自动化：材料入档即勾选对应新员工待办
      await this.toggleItem(id, meta.checklistKey, true, user);
    }
    return this.get(id, user);
  }

  /** 生成劳动合同：模板变量自动填充 */
  async createContract(id: string, user: JwtUser) {
    const onboarding = await this.get(id);
    if (onboarding.contract) throw new BadRequestException('合同已存在');

    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id: onboarding.applicationId },
      include: { candidate: true, job: { include: { department: true } }, offer: true },
    });
    const salary = application.offer?.salary as { base?: number; bonusMonths?: number } | null;
    const variables = {
      companyName: 'ART 科技有限公司',
      candidateName: application.candidate.name,
      jobTitle: application.job.title,
      department: application.job.department.name,
      grade: application.offer?.grade ?? '-',
      salaryBase: salary?.base ?? null,
      bonusMonths: salary?.bonusMonths ?? 0,
      probationMonths: 3,
      // 部署环境（容器）默认 UTC，直接切 toISOString 在北京时间 00:00-08:00 会错算成前一天
      signDate: new Date(Date.now() + CN_TZ_OFFSET_MS).toISOString().slice(0, 10),
    };
    const contract = await this.prisma.contract.create({
      data: {
        onboardingId: id,
        templateName: '标准劳动合同 v1',
        variables: variables as unknown as Prisma.InputJsonValue,
        signStatus: 'DRAFT',
      },
    });
    await this.activityLog.record(user, ACTIVITY_ACTIONS.CONTRACT_CREATED, 'Application', onboarding.applicationId, {
      template: contract.templateName,
      candidate: application.candidate.name,
    });
    return this.get(id, user);
  }

  /** 发送合同至电子签服务商 */
  async sendContract(contractId: string, user: JwtUser) {
    const contract = await this.findContract(contractId);
    if (contract.signStatus !== 'DRAFT') throw new BadRequestException('仅草稿状态可发送');
    const { providerRef } = await this.esign.send({
      contractId,
      content: JSON.stringify(contract.variables),
    });
    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        signStatus: 'SENT',
        variables: { ...(contract.variables as object), providerRef } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.activityLog.record(
      user,
      ACTIVITY_ACTIONS.CONTRACT_SENT,
      'Application',
      contract.onboarding.applicationId,
      { provider: this.esign.name, providerRef },
    );
    return this.get(contract.onboardingId, user);
  }

  /**
   * 完成签署：
   * 存证归档 → 勾选「签署劳动合同」→ Webhook 通知 IT 配设备开账号 → 尝试闭环入职。
   */
  async signContract(contractId: string, user: JwtUser) {
    const contract = await this.findContract(contractId);
    if (contract.signStatus !== 'SENT') throw new BadRequestException('仅已发送的合同可签署');
    const { evidenceNo, signedAt } = await this.esign.sign({ contractId });

    // 状态前置条件进写入条件：新员工连点两次「签署」，只有一次真正落库、触发后续留痕/勾选/IT Webhook
    const result = await this.prisma.contract.updateMany({
      where: { id: contractId, signStatus: 'SENT' },
      data: {
        signStatus: 'SIGNED',
        evidenceNo,
        variables: {
          ...(contract.variables as object),
          signedAt: signedAt.toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (result.count === 0) throw new ConflictException('该合同刚被签署过，请刷新查看');
    const applicationId = contract.onboarding.applicationId;
    await this.activityLog.record(user, ACTIVITY_ACTIONS.CONTRACT_SIGNED, 'Application', applicationId, {
      evidenceNo,
      provider: this.esign.name,
    });
    await this.toggleItem(contract.onboardingId, 'nh_contract', true, user);
    // 自动化：通知 IT 准备设备、开通邮箱与 IM 账号
    const candidate = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } } },
    });
    await this.webhook.fire(
      'contract.signed',
      applicationId,
      {
        candidate: candidate.candidate.name,
        job: candidate.job.title,
        evidenceNo,
        actions: ['prepare_computer', 'create_email_account', 'create_im_account'],
      },
      user,
    );
    return this.get(contract.onboardingId, user);
  }

  /** 清单全部完成 + 合同已签署 → 入职闭环：HIRED + 移入「已入职」 */
  private async completeIfReady(id: string, user: JwtUser) {
    const onboarding = await this.prisma.onboarding.findUniqueOrThrow({
      where: { id },
      include: { contract: true },
    });
    if (onboarding.status === 'COMPLETED') return;
    const checklist = onboarding.checklist as unknown as ChecklistItem[];
    const allDone = checklist.every((i) => i.done);
    const signed = onboarding.contract?.signStatus === 'SIGNED' || onboarding.contract?.signStatus === 'ARCHIVED';
    if (!allDone || !signed) return;

    await this.prisma.$transaction([
      this.prisma.onboarding.update({ where: { id }, data: { status: 'COMPLETED' } }),
      this.prisma.application.update({
        where: { id: onboarding.applicationId },
        data: { status: 'HIRED' },
      }),
    ]);
    await this.applications.moveToStageByName(onboarding.applicationId, '已入职', user);
    await this.activityLog.record(user, ACTIVITY_ACTIONS.ONBOARDING_COMPLETED, 'Application', onboarding.applicationId, {});
  }

  private static readonly ROLE_TOGGLE_OWNER: Partial<Record<string, ChecklistItem['owner']>> = {
    [RoleCode.IT_SUPPORT]: 'IT',
    [RoleCode.NEW_HIRE]: 'NEW_HIRE',
    [RoleCode.CANDIDATE]: 'NEW_HIRE', // 门户免登录操作以候选人身份进入，等同新员工待办
  };

  private assertCanToggle(user: JwtUser, item: ChecklistItem) {
    if (user.permissions.includes(PERMISSIONS.ONBOARDING_MANAGE)) return;
    const allowed = user.roles
      .map((r) => OnboardingService.ROLE_TOGGLE_OWNER[r])
      .filter((o): o is ChecklistItem['owner'] => Boolean(o));
    if (!allowed.includes(item.owner)) {
      throw new ForbiddenException(`「${item.label}」由 ${item.owner} 负责，当前角色不可勾选`);
    }
  }

  // ---------- 新员工免登录门户（H5 资料收集 + 电子签） ----------

  /** 确保入职单有门户令牌（老数据补发），返回令牌供前端拼 /portal/onboarding/:token */
  async ensurePortalToken(id: string): Promise<string> {
    const onboarding = await this.prisma.onboarding.findUnique({
      where: { id },
      select: { id: true, portalToken: true },
    });
    if (!onboarding) throw new NotFoundException('入职单不存在');
    if (onboarding.portalToken) return onboarding.portalToken;
    const token = newPortalToken();
    await this.prisma.onboarding.update({ where: { id }, data: { portalToken: token } });
    return token;
  }

  /** 按应聘记录查门户令牌（Offer 门户接受后引导新员工进入资料收集） */
  async portalTokenOf(applicationId: string): Promise<string | null> {
    const onboarding = await this.prisma.onboarding.findUnique({
      where: { applicationId },
      select: { portalToken: true },
    });
    return onboarding?.portalToken ?? null;
  }

  /** 新员工视角的入职单（不暴露内部 id 之外的敏感信息；材料仅回显已识别字段） */
  async portalView(token: string) {
    const onboarding = await this.findByToken(token);
    const documents = await Promise.all(
      ((onboarding.documents as unknown as DocumentRecord[] | null) ?? []).map(async (d) => ({
        type: d.type,
        label: d.label,
        fields: d.fields,
        addedAt: d.addedAt,
        needsReview: d.needsReview ?? false,
        fileUrl: await this.storage.tryPresignedGetUrl(d.fileKey, d.fileName ?? undefined),
      })),
    );
    return {
      company: 'ART 科技有限公司',
      candidateName: onboarding.application.candidate.name,
      jobTitle: onboarding.application.job.title,
      department: onboarding.application.job.department.name,
      status: onboarding.status,
      checklist: onboarding.checklist as unknown as ChecklistItem[],
      documents,
      contract: onboarding.contract
        ? {
            templateName: onboarding.contract.templateName,
            signStatus: onboarding.contract.signStatus,
            variables: onboarding.contract.variables,
            evidenceNo: onboarding.contract.evidenceNo,
          }
        : null,
      progress: this.progressOf(onboarding.checklist),
    };
  }

  /** 新员工在门户提交材料（拍照/文字，OCR 入档 + 自动勾选对应待办） */
  async portalAddDocument(token: string, dto: AddDocumentDto, file?: Express.Multer.File) {
    const onboarding = await this.findByToken(token);
    await this.addDocument(onboarding.id, dto, candidateActor(onboarding.application.candidate.name), file);
    return this.portalView(token);
  }

  /** 新员工在门户签署劳动合同（电子签 mock；真实服务商接入后走回调） */
  async portalSignContract(token: string) {
    const onboarding = await this.findByToken(token);
    if (!onboarding.contract) throw new BadRequestException('合同尚未生成，请等待 HR 操作');
    if (onboarding.contract.signStatus !== 'SENT') {
      throw new BadRequestException(
        onboarding.contract.signStatus === 'DRAFT' ? '合同尚未发送，请等待 HR 操作' : '合同已完成签署',
      );
    }
    await this.signContract(onboarding.contract.id, candidateActor(onboarding.application.candidate.name));
    return this.portalView(token);
  }

  private async findByToken(token: string) {
    const onboarding = await this.prisma.onboarding.findUnique({
      where: { portalToken: token },
      include: ONBOARDING_INCLUDE,
    });
    if (!onboarding) throw new NotFoundException('链接无效或已失效，请联系 HR');
    return onboarding;
  }

  private async findContract(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { onboarding: { select: { id: true, applicationId: true } } },
    });
    if (!contract) throw new NotFoundException('合同不存在');
    return { ...contract, onboardingId: contract.onboarding.id };
  }

  private progressOf(checklist: Prisma.JsonValue): { done: number; total: number } {
    const items = (checklist as unknown as ChecklistItem[] | null) ?? [];
    return { done: items.filter((i) => i.done).length, total: items.length };
  }
}
