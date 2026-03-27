import type { AuthUser } from '../stores/auth';
import { http } from './client';
import type {
  AnalyticsOverview,
  NotificationItem,
  BoardCard,
  BoardData,
  Candidate,
  CandidateDetail,
  Department,
  EvaluationDraft,
  FunnelData,
  Interview,
  JdDraft,
  Job,
  Offer,
  Paginated,
  Resume,
  RetentionHint,
  UserBrief,
} from './types';

export const authApi = {
  login: (data: { email: string; password: string }) =>
    http.post<{ accessToken: string; user: AuthUser }>('/auth/login', data).then((r) => r.data),
  profile: () => http.get<AuthUser>('/auth/profile').then((r) => r.data),
};

export const jobsApi = {
  list: (params: { page?: number; pageSize?: number; keyword?: string; status?: string }) =>
    http.get<Paginated<Job>>('/jobs', { params }).then((r) => r.data),
  create: (data: {
    title: string;
    departmentId: string;
    hiringManagerId?: string;
    description?: string;
    headcount?: number;
  }) => http.post<Job>('/jobs', data).then((r) => r.data),
};

export const boardApi = {
  get: (jobId: string) => http.get<BoardData>(`/jobs/${jobId}/board`).then((r) => r.data),
  moveCard: (applicationId: string, stageId: string) =>
    http.patch<BoardCard>(`/applications/${applicationId}/stage`, { stageId }).then((r) => r.data),
};

export const candidatesApi = {
  list: (params: { page?: number; pageSize?: number; keyword?: string }) =>
    http.get<Paginated<Candidate>>('/candidates', { params }).then((r) => r.data),
  create: (data: { name: string; email?: string; phone?: string; source?: string; tags?: string[] }) =>
    http.post<Candidate>('/candidates', data).then((r) => r.data),
  get: (id: string) => http.get<CandidateDetail>(`/candidates/${id}`).then((r) => r.data),
  addResume: (id: string, data: { rawText: string; fileName?: string }) =>
    http.post<Resume>(`/candidates/${id}/resumes`, data).then((r) => r.data),
};

export const applicationsApi = {
  create: (data: { candidateId: string; jobId: string }) =>
    http.post<BoardCard>('/applications', data).then((r) => r.data),
  score: (id: string) => http.post<BoardCard>(`/applications/${id}/score`).then((r) => r.data),
};

export const resumesApi = {
  parse: (id: string) => http.post<Resume>(`/resumes/${id}/parse`).then((r) => r.data),
};

export const aiApi = {
  generateJd: (data: { title: string; departmentName?: string; keywords?: string }) =>
    http.post<JdDraft>('/ai/generate-jd', data).then((r) => r.data),
};

export const offersApi = {
  list: () => http.get<Offer[]>('/offers').then((r) => r.data),
  create: (data: {
    applicationId: string;
    salaryBase: number;
    bonusMonths?: number;
    grade?: string;
    note?: string;
  }) => http.post<Offer>('/offers', data).then((r) => r.data),
  approve: (id: string, note?: string) =>
    http.post<Offer>(`/offers/${id}/approve`, { note }).then((r) => r.data),
  reject: (id: string, note?: string) =>
    http.post<Offer>(`/offers/${id}/reject`, { note }).then((r) => r.data),
  send: (id: string) => http.post<Offer>(`/offers/${id}/send`).then((r) => r.data),
  respond: (id: string, decision: 'ACCEPTED' | 'DECLINED') =>
    http.post<Offer>(`/offers/${id}/respond`, { decision }).then((r) => r.data),
  retention: (id: string) => http.post<RetentionHint>(`/offers/${id}/retention`).then((r) => r.data),
};

export const notificationsApi = {
  list: () =>
    http
      .get<{ items: NotificationItem[]; unread: number }>('/notifications')
      .then((r) => r.data),
  markRead: (id: string) =>
    http
      .patch<{ items: NotificationItem[]; unread: number }>(`/notifications/${id}/read`)
      .then((r) => r.data),
  markAllRead: () =>
    http
      .patch<{ items: NotificationItem[]; unread: number }>('/notifications/read-all')
      .then((r) => r.data),
};

export const analyticsApi = {
  overview: () => http.get<AnalyticsOverview>('/analytics/overview').then((r) => r.data),
  funnel: (jobId: string) => http.get<FunnelData>(`/analytics/funnel/${jobId}`).then((r) => r.data),
  insight: (jobId: string) =>
    http.post<{ insight: string; aiMeta: { provider: string } }>(`/analytics/insight/${jobId}`).then((r) => r.data),
};

export const interviewsApi = {
  list: (applicationId?: string) =>
    http
      .get<Interview[]>('/interviews', { params: applicationId ? { applicationId } : undefined })
      .then((r) => r.data),
  create: (data: {
    applicationId: string;
    round: number;
    scheduledAt?: string;
    durationMins?: number;
    meetingUrl?: string;
    interviewerIds: string[];
  }) => http.post<Interview>('/interviews', data).then((r) => r.data),
  submitEvaluation: (
    interviewId: string,
    data: {
      scorecard: Array<{ dimension: string; score: number; comment?: string }>;
      conclusion: string;
      comments?: string;
    },
  ) => http.post(`/interviews/${interviewId}/evaluations`, data).then((r) => r.data),
  draftEvaluation: (interviewId: string, notes: string) =>
    http
      .post<EvaluationDraft>(`/interviews/${interviewId}/evaluation-draft`, { notes })
      .then((r) => r.data),
};

export const departmentsApi = {
  list: () => http.get<Department[]>('/departments').then((r) => r.data),
};

export const usersApi = {
  list: (role?: string) =>
    http.get<UserBrief[]>('/users', { params: role ? { role } : undefined }).then((r) => r.data),
};
