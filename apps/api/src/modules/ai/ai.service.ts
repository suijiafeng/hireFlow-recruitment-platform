import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AiEngine,
  CompareInput,
  EvaluationDraftInput,
  FunnelInput,
  HelpdeskInput,
  JdInput,
  MatchInput,
  RetentionInput,
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

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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

  /**
   * 结果缓存（Token FinOps）：相同输入命中即回放，防重复解析刷 Token。
   * 仅在真实 LLM 引擎启用时生效（mock 零成本无需缓存）；缓存读写失败静默跳过不阻断。
   */
  private async cachedRun<T>(
    capability: string,
    input: unknown,
    fn: (engine: AiEngine) => Promise<T>,
  ): Promise<{ data: T; meta: AiMeta }> {
    if (!this.llm) return this.run(fn);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    try {
      const hit = await this.prisma.aiCache.findUnique({
        where: { capability_hash: { capability, hash } },
      });
      if (hit) {
        return { data: hit.payload as T, meta: { provider: `${hit.provider}·缓存`, degraded: false } };
      }
    } catch {
      /* 缓存不可用不影响主流程 */
    }
    const result = await this.run(fn);
    if (!result.meta.degraded && result.meta.provider !== this.mock.name) {
      try {
        await this.prisma.aiCache.create({
          data: {
            capability,
            hash,
            payload: result.data as unknown as Prisma.InputJsonValue,
            provider: result.meta.provider,
          },
        });
      } catch {
        /* 并发写重复等冲突静默忽略 */
      }
    }
    return result;
  }

  generateJd(input: JdInput) {
    return this.run((e) => e.generateJd(input));
  }

  parseResume(rawText: string) {
    return this.cachedRun('parseResume', rawText, (e) => e.parseResume(rawText));
  }

  scoreMatch(input: MatchInput) {
    return this.cachedRun('scoreMatch', input, (e) => e.scoreMatch(input));
  }

  draftEvaluation(input: EvaluationDraftInput) {
    return this.run((e) => e.draftEvaluation(input));
  }

  funnelInsight(input: FunnelInput) {
    return this.run((e) => e.funnelInsight(input));
  }

  answerQuestion(input: HelpdeskInput) {
    return this.run((e) => e.answerQuestion(input));
  }

  predictRetention(input: RetentionInput) {
    return this.run((e) => e.predictRetention(input));
  }

  compareCandidates(input: CompareInput) {
    return this.run((e) => e.compareCandidates(input));
  }
}
