import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** JWT 载荷（登录时签发，见 AuthService.login） */
export interface JwtUser {
  sub: string; // 用户 id
  email: string;
  name: string;
  roles: string[]; // RoleCode[]
  permissions: string[]; // PermissionCode[]
  departmentId: string | null;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as JwtUser;
});
