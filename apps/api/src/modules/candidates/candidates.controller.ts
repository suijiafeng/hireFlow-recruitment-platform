import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { fileTypeFilter, RESUME_MIME_TYPES } from '../../common/upload';
import { CandidatesService } from './candidates.service';
import { AddResumeDto } from './dto/add-resume.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CANDIDATE_READ)
  @ApiOperation({ summary: '候选人分页列表（面试官视角联系方式脱敏）' })
  list(@Query() query: QueryCandidatesDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.list(query, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CANDIDATE_CREATE)
  @ApiOperation({ summary: '新增候选人（手工录入/导入）' })
  create(@Body() dto: CreateCandidateDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CANDIDATE_READ)
  @ApiOperation({ summary: '360° 候选人详情（含应聘/面评/时间轴）' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.candidatesService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CANDIDATE_UPDATE)
  @ApiOperation({ summary: '更新候选人（局部字段）' })
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.update(id, dto, user);
  }

  @Post(':id/resumes')
  @RequirePermissions(PERMISSIONS.CANDIDATE_UPDATE)
  @ApiOperation({ summary: '文本导入简历' })
  addResume(@Param('id') id: string, @Body() dto: AddResumeDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.addResume(id, dto, user);
  }

  @Post(':id/resumes/file')
  @RequirePermissions(PERMISSIONS.CANDIDATE_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: fileTypeFilter(RESUME_MIME_TYPES),
    }),
  )
  @ApiOperation({ summary: '上传简历原件（PDF/文本自动抽取文字进入解析链路，原件入对象存储）' })
  addResumeFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的简历文件');
    return this.candidatesService.addResumeFile(id, file, user);
  }
}
