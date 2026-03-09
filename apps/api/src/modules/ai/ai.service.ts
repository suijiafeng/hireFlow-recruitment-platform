import { Injectable, Logger } from '@nestjs/common';
import type {
  AiEngine,
  EvaluationDraftInput,
  FunnelInput,
  JdInput,
  MatchInput,
} from './engines/ai-engine.interface';
import { MockAiEngine } from './engines/mock.engine';

/** 所有 AI 输出都附带来源标记，前端据此提示（可解释 + 可追溯） */
export interface AiMeta {
  provider: string;
  degraded: boolean;
}

/**
 * 统一 AI 网关：
 * - 真实 LLM 引擎后续接入，当前由确定性 Mock 打底；
 * - LLM 调用失败自动降级 Mock，不阻断人工流程。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly mock = new MockAiEngine();
  private readonly llm: AiEngine | null = null;

  private async run<T>(fn: (engine: AiEngine) => Promise<T>): Promise<{ data: T; meta: AiMeta }> {
    if (this.llm) {
      try {
        return { data: await fn(this.llm), meta: { provider: this.llm.name, degraded: false } };
      } catch (error) {
        this.logger.warn(
          `LLM 调用失败，已降级到规则引擎：${error instanceof Error ? error.message : error}`,
        );
        return { data: await fn(this.mock), meta: { provider: this.mock.name, degraded: true } };
      }
    }
    return { data: await fn(this.mock), meta: { provider: this.mock.name, degraded: false } };
  }

  generateJd(input: JdInput) {
    return this.run((e) => e.generateJd(input));
  }

  parseResume(rawText: string) {
    return this.run((e) => e.parseResume(rawText));
  }

  scoreMatch(input: MatchInput) {
    return this.run((e) => e.scoreMatch(input));
  }

  draftEvaluation(input: EvaluationDraftInput) {
    return this.run((e) => e.draftEvaluation(input));
  }

  funnelInsight(input: FunnelInput) {
    return this.run((e) => e.funnelInsight(input));
  }
}
