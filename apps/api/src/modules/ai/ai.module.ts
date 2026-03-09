import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';

// 全局模块：简历解析、匹配评分、面评草稿、漏斗诊断等各业务模块都会用到
@Global()
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
