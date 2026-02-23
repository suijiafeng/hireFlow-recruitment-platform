import type { AuthUser } from '../stores/auth';
import { http } from './client';
import type { Candidate, Department, Job, Paginated, UserBrief } from './types';

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

export const candidatesApi = {
  list: (params: { page?: number; pageSize?: number; keyword?: string }) =>
    http.get<Paginated<Candidate>>('/candidates', { params }).then((r) => r.data),
  create: (data: { name: string; email?: string; phone?: string; source?: string; tags?: string[] }) =>
    http.post<Candidate>('/candidates', data).then((r) => r.data),
};

export const departmentsApi = {
  list: () => http.get<Department[]>('/departments').then((r) => r.data),
};

export const usersApi = {
  list: (role?: string) =>
    http.get<UserBrief[]>('/users', { params: role ? { role } : undefined }).then((r) => r.data),
};
