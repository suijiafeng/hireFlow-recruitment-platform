import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateCompanyDocDto, UpdateCompanyDocDto } from './dto/company-doc.dto';

@Injectable()
export class CompanyDocsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.companyDoc.findMany({ orderBy: { title: 'asc' } });
  }

  create(dto: CreateCompanyDocDto) {
    return this.prisma.companyDoc.create({ data: { ...dto, tags: dto.tags ?? [] } });
  }

  async update(id: string, dto: UpdateCompanyDocDto) {
    const exists = await this.prisma.companyDoc.count({ where: { id } });
    if (exists === 0) throw new NotFoundException('文档不存在');
    return this.prisma.companyDoc.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const exists = await this.prisma.companyDoc.count({ where: { id } });
    if (exists === 0) throw new NotFoundException('文档不存在');
    await this.prisma.companyDoc.delete({ where: { id } });
  }
}
