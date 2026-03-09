import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { CurrentUser, type JwtUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { DraftEvaluationDto } from './dto/draft-evaluation.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { InterviewsService } from './interviews.service';

@ApiTags('interviews')
@ApiBearerAuth()
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.INTERVIEW_SCHEDULE)
  @ApiOperation({ summary: '安排面试并指派面试官' })
  create(@Body() dto: CreateInterviewDto, @CurrentUser() user: JwtUser) {
    return this.interviewsService.create(dto, user);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.EVALUATION_READ)
  @ApiOperation({ summary: '面试列表（?applicationId= 过滤；缺省返回近期总览）' })
  list(@Query('applicationId') applicationId?: string) {
    return this.interviewsService.list(applicationId);
  }

  @Post(':id/evaluation-draft')
  @RequirePermissions(PERMISSIONS.EVALUATION_SUBMIT)
  @ApiOperation({ summary: 'AI 生成面评草稿（不落库，供表单预填后人工确认）' })
  draftEvaluation(@Param('id') id: string, @Body() dto: DraftEvaluationDto) {
    return this.interviewsService.draftEvaluation(id, dto.notes);
  }

  @Post(':id/evaluations')
  @RequirePermissions(PERMISSIONS.EVALUATION_SUBMIT)
  @ApiOperation({ summary: '提交面试评价（结构化评分卡）' })
  submitEvaluation(
    @Param('id') id: string,
    @Body() dto: SubmitEvaluationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.interviewsService.submitEvaluation(id, dto, user);
  }
}
