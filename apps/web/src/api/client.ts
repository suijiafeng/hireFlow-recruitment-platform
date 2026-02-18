import axios from 'axios';
import { useAuthStore } from '../stores/auth';

export const http = axios.create({ baseURL: '/api', timeout: 15_000 });

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** 从 axios 错误中提取后端返回的 message，供 message.error 展示 */
export function extractErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join('；');
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}
