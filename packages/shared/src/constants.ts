/** 新建职位时的默认 Pipeline 阶段（可在职位维度自定义） */
export const DEFAULT_PIPELINE_STAGES = [
  '简历初筛',
  '一面',
  '二面',
  'Offer',
  '待入职',
  '已入职',
] as const;

/** ActivityLog.action 取值约定：<实体>.<动作> */
export const ACTIVITY_ACTIONS = {
  JOB_CREATED: 'job.created',
  JOB_UPDATED: 'job.updated',
  STAGES_UPDATED: 'job.stages_updated',
  CANDIDATE_CREATED: 'candidate.created',
  CANDIDATE_UPDATED: 'candidate.updated',
  RESUME_ADDED: 'resume.added',
  RESUME_PARSED: 'resume.parsed',
  APPLICATION_CREATED: 'application.created',
  APPLICATION_SCORED: 'application.scored',
  APPLICATION_STAGE_CHANGED: 'application.stage_changed',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
  EVALUATION_SUBMITTED: 'evaluation.submitted',
  OFFER_INITIATED: 'offer.initiated',
  OFFER_APPROVED: 'offer.approved',
  OFFER_REJECTED: 'offer.rejected',
  OFFER_SENT: 'offer.sent',
  OFFER_RESPONDED: 'offer.responded',
  APPLICATION_REJECTED: 'application.rejected',
  APPLICATION_STAGE_REVERTED: 'application.stage_reverted',
} as const;

/** 阶段停留 SLA（天）：超过 warn 标黄、超过 danger 标红（后续做成可配置） */
export const STAGE_STAY_SLA = { warnDays: 3, dangerDays: 7 } as const;

/** 淘汰/撤回原因码（原因码强制，供漏斗分析与人才库回流） */
export const REJECT_REASONS = [
  '技能不符',
  '经验不足',
  '薪资不匹配',
  '文化适配度低',
  '沟通表达欠佳',
  '稳定性存疑',
  '候选人失联',
  '接受了其他机会',
  '岗位关闭',
  '其他',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];
