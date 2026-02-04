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
  APPLICATION_CREATED: 'application.created',
  APPLICATION_STAGE_CHANGED: 'application.stage_changed',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
  EVALUATION_SUBMITTED: 'evaluation.submitted',
} as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];
