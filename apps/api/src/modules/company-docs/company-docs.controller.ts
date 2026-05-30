import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CompanyDocsService } from './company-docs.service';
import { CreateCompanyDocDto, UpdateCompanyDocDto } from './dto/company-doc.dto';

/** 制度文档管理：入职问答机器人知识库的维护入口（只读检索见 HelpdeskController） */
@ApiTags('company-docs')
@ApiBearerAuth()
@Controller('company-docs')
@RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
export class CompanyDocsController {
  constructor(private readonly companyDocsService: CompanyDocsService) {}

  @Get()
  @ApiOperation({ summary: '制度文档列表（含正文，管理用）' })
  list() {
    return this.companyDocsService.list();
  }

  @Post()
  @ApiOperation({ summary: '新建制度文档' })
  create(@Body() dto: CreateCompanyDocDto) {
    return this.companyDocsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新制度文档' })
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDocDto) {
    return this.companyDocsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除制度文档' })
  remove(@Param('id') id: string) {
    return this.companyDocsService.remove(id);
  }
}
