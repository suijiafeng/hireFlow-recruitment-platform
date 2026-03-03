import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CandidatesService } from './candidates.service';
import { AddResumeDto } from './dto/add-resume.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CANDIDATE_READ)
  @ApiOperation({ summary: '候选人分页列表' })
  list(@Query() query: QueryCandidatesDto) {
    return this.candidatesService.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CANDIDATE_CREATE)
  @ApiOperation({ summary: '新增候选人（手工录入/导入）' })
  create(@Body() dto: CreateCandidateDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CANDIDATE_READ)
  @ApiOperation({ summary: '360° 候选人详情（含应聘/时间轴）' })
  findOne(@Param('id') id: string) {
    return this.candidatesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CANDIDATE_UPDATE)
  @ApiOperation({ summary: '更新候选人' })
  update(@Param('id') id: string, @Body() dto: CreateCandidateDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.update(id, dto, user);
  }

  @Post(':id/resumes')
  @RequirePermissions(PERMISSIONS.CANDIDATE_UPDATE)
  @ApiOperation({ summary: '文本导入简历' })
  addResume(@Param('id') id: string, @Body() dto: AddResumeDto, @CurrentUser() user: JwtUser) {
    return this.candidatesService.addResume(id, dto, user);
  }
}
