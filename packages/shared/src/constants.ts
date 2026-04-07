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
  INTERVIEW_CANCELED: 'interview.canceled',
  EVALUATION_SUBMITTED: 'evaluation.submitted',
  OFFER_INITIATED: 'offer.initiated',
  OFFER_APPROVED: 'offer.approved',
  OFFER_REJECTED: 'offer.rejected',
  OFFER_SENT: 'offer.sent',
  OFFER_RESPONDED: 'offer.responded',
  OFFER_RESUBMITTED: 'offer.resubmitted',
  OFFER_EXTENDED: 'offer.extended',
  OFFER_EXPIRED: 'offer.expired',
  APPLICATION_WITHDRAWN: 'application.withdrawn',
  ONBOARDING_CREATED: 'onboarding.created',
  ONBOARDING_ITEM_DONE: 'onboarding.item_done',
  ONBOARDING_COMPLETED: 'onboarding.completed',
  DOCUMENT_ADDED: 'onboarding.document_added',
  CONTRACT_CREATED: 'contract.created',
  CONTRACT_SENT: 'contract.sent',
  CONTRACT_SIGNED: 'contract.signed',
  WEBHOOK_FIRED: 'webhook.fired',
  APPLICATION_REJECTED: 'application.rejected',
  APPLICATION_STAGE_REVERTED: 'application.stage_reverted',
} as const;

/** 入职三方待办清单默认模板，owner: HR / IT / NEW_HIRE */
export const DEFAULT_ONBOARDING_CHECKLIST = [
  { key: 'hr_profile', label: '建立员工档案', owner: 'HR' },
  { key: 'hr_workspace', label: '安排工位与门禁', owner: 'HR' },
  { key: 'it_computer', label: '准备电脑设备', owner: 'IT' },
  { key: 'it_email', label: '开通企业邮箱', owner: 'IT' },
  { key: 'it_im', label: '开通内部 IM 账号', owner: 'IT' },
  { key: 'nh_id_card', label: '上传身份证', owner: 'NEW_HIRE' },
  { key: 'nh_bank_card', label: '上传银行卡', owner: 'NEW_HIRE' },
  { key: 'nh_diploma', label: '上传学历证书', owner: 'NEW_HIRE' },
  { key: 'nh_contract', label: '签署劳动合同', owner: 'NEW_HIRE' },
] as const;

/** 入职材料类型 → 自动勾选的清单项 */
export const DOCUMENT_TYPE_META = {
  ID_CARD: { label: '身份证', checklistKey: 'nh_id_card' },
  BANK_CARD: { label: '银行卡', checklistKey: 'nh_bank_card' },
  DIPLOMA: { label: '学历证书', checklistKey: 'nh_diploma' },
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPE_META;

/** Offer 答复有效期（工作日）：到期失效、可续期一次 */
export const OFFER_VALID_BUSINESS_DAYS = 5;

/** 候选人拒绝 Offer 原因码（原因码强制） */
export const OFFER_DECLINE_REASONS = [
  '薪资不符合预期',
  '接受了其他机会',
  '职业规划调整',
  '工作地点/通勤',
  '家庭原因',
  '其他',
] as const;

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
