import type { ApplicationStatus, JobStatus } from '@hireflow/shared';

export interface Paginated<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Department {
  id: string;
  name: string;
}

export interface UserBrief {
  id: string;
  name: string;
  email?: string;
}

/** GET /users 的完整行（设置页成员管理用；选择器场景只取 id/name/email） */
export interface UserItem extends UserBrief {
  email: string;
  status: string;
  department: { id: string; name: string } | null;
  roles: Array<{ role: { code: string; name: string } }>;
  createdAt: string;
}

export interface ScorecardDimension {
  dimension: string;
  weight: number;
}

export interface Job {
  id: string;
  title: string;
  description?: string | null;
  requirement?: string | null;
  headcount: number;
  status: JobStatus;
  department: Department;
  hiringManager: UserBrief | null;
  scorecardTemplate?: ScorecardDimension[] | null;
  _count?: { applications: number };
  createdAt: string;
}

export interface CandidateApplicationBrief {
  id: string;
  job: { id: string; title: string };
  stage: { id: string; name: string };
  status: ApplicationStatus;
}

export interface Candidate {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  tags: string[];
  applications?: CandidateApplicationBrief[];
  _count?: { resumes: number };
  createdAt: string;
}

export interface Evaluation {
  id: string;
  interviewer: UserBrief;
  conclusion: string | null;
  comments: string | null;
  scorecard: Array<{ dimension: string; score: number; comment?: string }> | null;
  submittedAt: string | null;
}

export interface Interview {
  id: string;
  round: number;
  scheduledAt: string | null;
  durationMins: number | null;
  meetingUrl: string | null;
  status: string;
  interviewers: Array<{ user: UserBrief }>;
  evaluations: Evaluation[];
  application?: {
    id: string;
    candidate: { id: string; name: string };
    job: { id: string; title: string; scorecardTemplate?: ScorecardDimension[] | null };
    stage: { name: string };
  };
}

export interface Resume {
  id: string;
  fileName: string | null;
  fileKey: string | null;
  parseStatus: string;
  skills: string[];
  rawText: string | null;
  parsed: { summary?: string } | null;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  actorName: string | null;
  actor: { id: string; name: string } | null;
  payload: Record<string, unknown> | null;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export interface PermissionDef {
  id: string;
  code: string;
  name: string;
  group: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  dataScope: string;
  permissions: Array<{ permission: PermissionDef }>;
  _count: { users: number };
}

export interface DetailApplication {
  id: string;
  job: { id: string; title: string };
  stage: { id: string; name: string };
  status: ApplicationStatus;
  matchScore: number | null;
  matchReport?: MatchReport | null;
  interviews: Interview[];
}

export interface CandidateDetail extends Candidate {
  resumes: Resume[];
  applications: (CandidateApplicationBrief & DetailApplication)[];
  timeline: ActivityItem[];
}

export interface AiMeta {
  provider: string;
  degraded: boolean;
}

export interface MatchReport {
  score: number;
  hits: string[];
  misses: string[];
  highlights: string;
  risks: string;
  aiMeta?: AiMeta;
}

export interface JdDraft {
  description: string;
  requirement: string;
  aiMeta: AiMeta;
}

export interface EvaluationDraft {
  scorecard: Array<{ dimension: string; score: number; comment: string }>;
  conclusion: string;
  comments: string;
  aiMeta: AiMeta;
}

export interface FunnelStage {
  id: string;
  name: string;
  current: number;
  reached: number;
  conversion: number | null;
}

export interface FunnelData {
  job: { id: string; title: string };
  stages: FunnelStage[];
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface AnalyticsOverview {
  openJobs: number;
  pausedJobs: number;
  candidates: number;
  upcomingInterviews: number;
  hired: number;
}

export interface BoardCard {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  position: number;
  createdAt: string;
  stageId: string;
  stageEnteredAt: string;
  version: number;
  candidate: { id: string; name: string; tags: string[]; source: string | null };
}

export interface OfferSalary {
  base: number;
  bonusMonths: number;
  note?: string | null;
}

export interface Offer {
  id: string;
  salary: OfferSalary | null;
  grade: string | null;
  approvalStatus: string;
  approvalNote: string | null;
  decision: string | null;
  decisionReason: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  extendedOnce: boolean;
  portalToken: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  application: {
    id: string;
    stageId: string;
    candidate: { id: string; name: string; tags: string[] };
    job: { id: string; title: string; department: { name: string } };
  };
}

export interface RetentionHint {
  probability: number;
  factors: string[];
  aiMeta: AiMeta;
}

export interface ChecklistItem {
  key: string;
  label: string;
  owner: 'HR' | 'IT' | 'NEW_HIRE';
  done: boolean;
  doneAt: string | null;
}

export interface OnboardingDocument {
  type: string;
  label: string;
  fields: Record<string, string>;
  addedAt: string;
  ocrProvider: string;
  fileName?: string | null;
  fileUrl?: string | null; // 原件预签名预览链接（10 分钟有效）
  needsReview?: boolean; // 未识别出字段：待人工核对（低置信度阻断）
}

export interface Contract {
  id: string;
  templateName: string | null;
  variables: Record<string, unknown> | null;
  signStatus: string;
  evidenceNo: string | null;
}

export interface Onboarding {
  id: string;
  status: string;
  checklist: ChecklistItem[];
  documents: OnboardingDocument[] | null;
  contract: Contract | null;
  progress: { done: number; total: number };
  createdAt: string;
  application: {
    id: string;
    candidate: { id: string; name: string; phone: string | null; email: string | null };
    job: { id: string; title: string; department: { name: string } };
  };
}

/** 候选人免登录 Offer 门户视图（/portal/offer/:token） */
export interface OfferPortalView {
  company: string;
  candidateName: string;
  jobTitle: string;
  department: string;
  status: string;
  decision: string | null;
  decisionReason: string | null;
  respondedAt: string | null;
  declineReasons: readonly string[];
  /** 议价/重提中：老链接不展示已撤回的薪资方案 */
  preparing: boolean;
  salary?: OfferSalary | null;
  grade?: string | null;
  sentAt?: string | null;
  expiresAt?: string | null;
  extendedOnce?: boolean;
  onboardingPortalToken?: string | null;
}

/** 新员工免登录入职门户视图（/portal/onboarding/:token） */
export interface OnboardingPortalView {
  company: string;
  candidateName: string;
  jobTitle: string;
  department: string;
  status: string;
  checklist: ChecklistItem[];
  documents: Array<{
    type: string;
    label: string;
    fields: Record<string, string>;
    addedAt: string;
    needsReview?: boolean;
    fileUrl?: string | null;
  }>;
  contract: {
    templateName: string | null;
    signStatus: string;
    variables: Record<string, unknown> | null;
    evidenceNo: string | null;
  } | null;
  progress: { done: number; total: number };
}

export interface HelpdeskAnswer {
  answer: string;
  sources: Array<{ id: string; title: string }>;
  aiMeta: AiMeta;
}

export interface TodoSummary {
  newResumes: number;
  myPendingEvaluations: number;
  pendingOffers: number | null;
  rejectedOffers: number | null;
  offersDue: number | null;
  onboardingInProgress: number;
  docsNeedReview: number;
}

/** 面试官可约时段（自助选时） */
export interface InterviewerSlot {
  id: string;
  startAt: string;
  endAt: string;
  bookedBy: string | null;
}

export interface InterviewPortalView {
  company: string;
  candidateName: string;
  jobTitle: string;
  round: number;
  durationMins: number;
  scheduledAt: string | null;
  status: string;
  slots: Array<{ id: string; startAt: string; endAt: string }>;
}

export interface PrescreenView {
  company: string;
  candidateName: string;
  jobTitle: string;
  prescreen: {
    expectedSalary: number;
    availableDate: string;
    travelOk: boolean;
    note: string | null;
    flags: string[];
    submittedAt: string;
  } | null;
}

/** 候选人对比（2-4 人并排 + AI 综合意见） */
export interface CompareData {
  jobTitle: string;
  candidates: Array<{
    applicationId: string;
    name: string;
    matchScore: number | null;
    tags: string[];
    highlights: string | null;
    risks: string | null;
    evaluations: Array<{ conclusion: string | null; avgScore: number | null; comments: string | null }>;
  }>;
  ai: {
    summary: string;
    ranking: Array<{ name: string; rank: number; rationale: string }>;
    risks: string;
  };
  aiMeta: AiMeta;
}

export interface BoardColumn {
  stage: { id: string; name: string; order: number };
  applications: BoardCard[];
}

/** 近 N 周投递/入职趋势（大盘折线图） */
export interface TrendData {
  weeks: number;
  start: string;
  points: Array<{ week: string; applied: number; hired: number }>;
}

/** 数据洞察报表 */
export interface InsightsData {
  tth: {
    medianDays: number | null;
    hiredCount: number;
    byJob: Array<{ jobTitle: string; medianDays: number | null; hired: number }>;
  };
  offer: {
    sent: number;
    accepted: number;
    acceptRate: number | null;
    renegeCount: number;
    renegeRate: number | null;
  };
  channels: Array<{
    source: string;
    applied: number;
    interviewed: number;
    offered: number;
    accepted: number;
    hired: number;
    interviewRate: number | null;
    hireRate: number | null;
  }>;
  interviewers: Array<{
    name: string;
    evaluations: number;
    onTimeRate: number | null;
    passRate: number | null;
    passRateDeviation: number | null;
  }>;
  overallPassRate: number | null;
  stageStay: Array<{ stage: string; samples: number; p50Days: number | null; p90Days: number | null }>;
}

/** 人才库唤醒推荐（历史候选人 × 新职位 AI 重新打分） */
export interface TalentPoolRecommendation {
  candidate: { id: string; name: string; tags: string[]; source: string | null };
  score: number;
  hits: string[];
  highlights: string;
  aiMeta: AiMeta;
  lastApplication: {
    jobTitle: string;
    status: string;
    rejectReason: string | null;
    updatedAt: string;
  } | null;
}

export interface TalentPoolScanResult {
  job: { id: string; title: string };
  scanned: number;
  recommendations: TalentPoolRecommendation[];
}

/** 批量操作结果（部分失败不回滚，错误报告模式） */
export interface BatchResult {
  total: number;
  succeeded: number;
  failed: Array<{ id: string; candidate: string | null; error: string }>;
}

export interface BoardData {
  job: { id: string; title: string; status: JobStatus };
  columns: BoardColumn[];
}
