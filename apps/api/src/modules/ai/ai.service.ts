import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiEngine,
  EvaluationDraftInput,
  FunnelInput,
  JdInput,
  MatchInput,
} from './engines/ai-engine.interface';
import { AnthropicAiEngine } from './engines/anthropic.engine';
import { MockAiEngine } from './engines/mock.engine';

/** 所有 AI 输出都附带来源标记，前端据此提示（可解释 + 可追溯） */
export interface AiMeta {
  provider: string;
  degraded: boolean;
}

/**
 * 统一 AI 网关：
 * - 配置 ANTHROPIC_API_KEY 时走真实 LLM，否则走确定性 Mock；
 * - LLM 调用失败自动降级 Mock，不阻断人工流程。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly mock = new MockAiEngine();
  private readonly llm: AiEngine | null = null;

  constructor(config: ConfigService) {
    const provider = config.get<string>('AI_PROVIDER') ?? 'auto';
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');

    if (provider !== 'mock' && apiKey) {
      this.llm = new AnthropicAiEngine({
        apiKey,
        model: config.get<string>('ANTHROPIC_MODEL') ?? 'claude-opus-4-8',
        baseURL: config.get<string>('ANTHROPIC_BASE_URL') || undefined,
      });
      this.logger.log(`AI 引擎已启用：${this.llm.name}`);
    } else {
      this.logger.warn('未配置 ANTHROPIC_API_KEY，AI 能力使用规则引擎（mock）兜底');
    }
  }

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
