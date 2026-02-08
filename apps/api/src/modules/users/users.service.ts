import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 内部用户列表（设置页/面试官选择器用） */
  async list(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { roles: { some: { role: { code: role } } } } : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        department: { select: { id: true, name: true } },
        roles: { select: { role: { select: { code: true, name: true } } } },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
