import { addBusinessDays, candidateActor, newPortalToken } from './portal';

describe('portal 工具', () => {
  it('addBusinessDays 跳过周末：周五 +5 个工作日 = 下周五', () => {
    // 2026-07-17 是周五
    const friday = new Date('2026-07-17T10:00:00');
    const due = addBusinessDays(friday, 5);
    expect(due.getDay()).toBe(5); // 周五
    expect(due.getDate()).toBe(24);
    // 截止到当天最后一刻
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });

  it('addBusinessDays 周中不跨周末时按自然日推进', () => {
    // 2026-07-13 是周一，+3 个工作日 = 周四
    const monday = new Date('2026-07-13T09:00:00');
    const due = addBusinessDays(monday, 3);
    expect(due.getDate()).toBe(16);
    expect(due.getDay()).toBe(4);
  });

  it('newPortalToken 不可枚举且每次不同', () => {
    const a = newPortalToken();
    const b = newPortalToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32); // 24 字节 base64url
  });

  it('candidateActor 不携带 userId（留痕 actorId 落 null），姓名可读', () => {
    const actor = candidateActor('张三');
    expect(actor.sub).toBeNull();
    expect(actor.name).toContain('张三');
    expect(actor.permissions).toEqual([]);
  });
});
