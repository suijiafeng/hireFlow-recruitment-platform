import type { AuthUser } from '../stores/auth';
import { http } from './client';

export const authApi = {
  login: (data: { email: string; password: string }) =>
    http.post<{ accessToken: string; user: AuthUser }>('/auth/login', data).then((r) => r.data),
  profile: () => http.get<AuthUser>('/auth/profile').then((r) => r.data),
};
