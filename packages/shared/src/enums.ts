/**
 * 与 apps/api/prisma/schema.prisma 中的枚举保持一致。
 * 修改任一侧时必须同步另一侧（schema 是数据库事实来源，这里是前后端代码共用镜像）。
 */

export enum RoleCode {
  ADMIN = 'ADMIN',
  HR = 'HR',
  HIRING_MANAGER = 'HIRING_MANAGER',
  INTERVIEWER = 'INTERVIEWER',
  CANDIDATE = 'CANDIDATE',
  NEW_HIRE = 'NEW_HIRE',
  IT_SUPPORT = 'IT_SUPPORT',
}

export enum DataScope {
  ALL = 'ALL',
  DEPARTMENT = 'DEPARTMENT',
  OWN = 'OWN',
  ASSIGNED = 'ASSIGNED',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum JobStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  OPEN = 'OPEN',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
}

export enum ApplicationStatus {
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  HIRED = 'HIRED',
}

export enum ResumeParseStatus {
  PENDING = 'PENDING',
  PARSING = 'PARSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum InterviewStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
}

export enum EvaluationConclusion {
  STRONG_YES = 'STRONG_YES',
  YES = 'YES',
  NO = 'NO',
  STRONG_NO = 'STRONG_NO',
}

export enum OfferApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT = 'SENT',
  /** 到期未答复自动失效，可续期一次回到 SENT */
  EXPIRED = 'EXPIRED',
}

export enum OfferDecision {
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum ContractSignStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  SIGNED = 'SIGNED',
  ARCHIVED = 'ARCHIVED',
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  [JobStatus.DRAFT]: '草稿',
  [JobStatus.PENDING_APPROVAL]: '待审批',
  [JobStatus.OPEN]: '招聘中',
  [JobStatus.PAUSED]: '已暂停',
  [JobStatus.CLOSED]: '已关闭',
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  [ApplicationStatus.ACTIVE]: '流程中',
  [ApplicationStatus.REJECTED]: '已淘汰',
  [ApplicationStatus.WITHDRAWN]: '已撤回',
  [ApplicationStatus.HIRED]: '已入职',
};

export const EVALUATION_CONCLUSION_LABEL: Record<EvaluationConclusion, string> = {
  [EvaluationConclusion.STRONG_YES]: '强烈推荐',
  [EvaluationConclusion.YES]: '推荐',
  [EvaluationConclusion.NO]: '不推荐',
  [EvaluationConclusion.STRONG_NO]: '强烈不推荐',
};

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  [InterviewStatus.SCHEDULED]: '已安排',
  [InterviewStatus.COMPLETED]: '已完成',
  [InterviewStatus.CANCELED]: '已取消',
};

export const OFFER_APPROVAL_STATUS_LABEL: Record<OfferApprovalStatus, string> = {
  [OfferApprovalStatus.DRAFT]: '草稿',
  [OfferApprovalStatus.PENDING]: '待审批',
  [OfferApprovalStatus.APPROVED]: '已批准',
  [OfferApprovalStatus.REJECTED]: '已驳回',
  [OfferApprovalStatus.SENT]: '已发送',
  [OfferApprovalStatus.EXPIRED]: '已失效',
};

export const OFFER_DECISION_LABEL: Record<OfferDecision, string> = {
  [OfferDecision.ACCEPTED]: '已接受',
  [OfferDecision.DECLINED]: '已拒绝',
};

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  [OnboardingStatus.NOT_STARTED]: '未开始',
  [OnboardingStatus.IN_PROGRESS]: '进行中',
  [OnboardingStatus.COMPLETED]: '已完成',
};

export const CONTRACT_SIGN_STATUS_LABEL: Record<ContractSignStatus, string> = {
  [ContractSignStatus.DRAFT]: '草稿',
  [ContractSignStatus.SENT]: '待签署',
  [ContractSignStatus.SIGNED]: '已签署',
  [ContractSignStatus.ARCHIVED]: '已归档',
};

export const ROLE_LABEL: Record<RoleCode, string> = {
  [RoleCode.ADMIN]: '系统管理员',
  [RoleCode.HR]: 'HR / 招聘专员',
  [RoleCode.HIRING_MANAGER]: '用人经理',
  [RoleCode.INTERVIEWER]: '面试官',
  [RoleCode.CANDIDATE]: '候选人',
  [RoleCode.NEW_HIRE]: '新员工',
  [RoleCode.IT_SUPPORT]: 'IT / 行政',
};
