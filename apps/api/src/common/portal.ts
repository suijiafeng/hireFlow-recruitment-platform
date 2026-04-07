import { randomBytes } from 'node:crypto';
import { RoleCode } from '@hireflow/shared';
import type { JwtUser } from './decorators/current-user.decorator';

/**
 * 候选人/新员工免登录门户（H5）公共工具。
 * 门户不走 JWT：一条记录一个不可枚举的随机令牌，链接即凭证。
 * 令牌只在 HR 发送动作时生成，泄露可通过重新生成作废旧链接（TODO：续期/重发时轮换）。
 */
export function newPortalToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * 门户操作的留痕主体：候选人没有 User 账号，actorId 落 null（ActivityLog 外键安全），
 * actorName 显示候选人姓名，保证时间轴上"谁做的"依然可读。
 */
export function candidateActor(name: string): JwtUser {
  return {
    sub: null as unknown as string,
    email: '',
    name: `${name}（候选人）`,
    roles: [RoleCode.CANDIDATE],
    permissions: [],
    departmentId: null,
  };
}

/** 从 from 起加 N 个工作日（跳过周六日；法定节假日后续接日历服务），截止到当天 23:59:59 */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  d.setHours(23, 59, 59, 999);
  return d;
}
