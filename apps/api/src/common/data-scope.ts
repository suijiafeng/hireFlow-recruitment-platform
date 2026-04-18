import { DataScope } from '@hireflow/shared';
import type { JwtUser } from './decorators/current-user.decorator';

/** 数据范围宽窄序：全局 > 本部门 > 仅被指派 > 仅本人 */
const SCOPE_WIDTH: Record<string, number> = {
  [DataScope.ALL]: 4,
  [DataScope.DEPARTMENT]: 3,
  [DataScope.ASSIGNED]: 2,
  [DataScope.OWN]: 1,
};

/** 多角色取最宽范围（如 管理员+面试官 → 全局） */
export function widestScope(scopes: string[]): DataScope {
  let widest: DataScope = DataScope.OWN;
  for (const s of scopes) {
    if ((SCOPE_WIDTH[s] ?? 0) > SCOPE_WIDTH[widest]) widest = s as DataScope;
  }
  return widest;
}

/**
 * 部门行级过滤（用人经理「本部门」）：
 * 返回需要限定的部门 id；不需要限定返回 null。
 * DEPARTMENT 范围但用户未挂部门时返回哨兵值——匹配不到任何数据（宁可看不见，不可越权看）。
 */
export function departmentScopeOf(user: JwtUser): string | null {
  if (user.dataScope !== DataScope.DEPARTMENT) return null;
  return user.departmentId ?? '__no_department__';
}

/** 「仅被指派」范围（面试官）：候选人/面试须与本人有指派关系 */
export function isAssignedScope(user: JwtUser): boolean {
  return user.dataScope === DataScope.ASSIGNED;
}
