import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hireflow/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AiService } from './ai.service';
import { GenerateJdDto } from './dto/generate-jd.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-jd')
  @RequirePermissions(PERMISSIONS.JOB_CREATE)
  @ApiOperation({ summary: 'AI 生成职位描述' })
  async generateJd(@Body() dto: GenerateJdDto) {
    const { data, meta } = await this.aiService.generateJd(dto);
    return { ...data, aiMeta: meta };
  }
}
