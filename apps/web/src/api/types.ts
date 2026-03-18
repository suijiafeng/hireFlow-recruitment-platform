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

export interface Job {
  id: string;
  title: string;
  description?: string | null;
  requirement?: string | null;
  headcount: number;
  status: JobStatus;
  department: Department;
  hiringManager: UserBrief | null;
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
    job: { id: string; title: string };
    stage: { name: string };
  };
}

export interface Resume {
  id: string;
  fileName: string | null;
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
  createdAt: string;
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

export interface AnalyticsOverview {
  openJobs: number;
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
  candidate: { id: string; name: string; tags: string[]; source: string | null };
}

export interface BoardColumn {
  stage: { id: string; name: string; order: number };
  applications: BoardCard[];
}

export interface BoardData {
  job: { id: string; title: string; status: JobStatus };
  columns: BoardColumn[];
}
