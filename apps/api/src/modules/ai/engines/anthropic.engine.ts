import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { EvaluationConclusion } from '@hireflow/shared';
import type {
  AiEngine,
  EvaluationDraft,
  EvaluationDraftInput,
  FunnelInput,
  JdDraft,
  JdInput,
  MatchInput,
  MatchResult,
  ParsedResume,
} from './ai-engine.interface';

const JD_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string', description: '岗位职责，分条列出，约 200-300 字' },
    requirement: { type: 'string', description: '任职要求，分条列出，约 150-250 字' },
  },
  required: ['description', 'requirement'],
  additionalProperties: false,
} as const;

const PARSED_RESUME_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '约150字的候选人亮点与风险提示' },
    skills: {
      type: 'array',
      items: { type: 'string' },
      description: '技能标签，含语义推导（如“精通Vue”应同时给出 Vue、前端开发、JavaScript）',
    },
    educations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          school: { type: 'string' },
          degree: { type: 'string' },
          major: { type: 'string' },
        },
        required: ['school', 'degree', 'major'],
        additionalProperties: false,
      },
    },
    experiences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          title: { type: 'string' },
          years: { type: 'string' },
          highlights: { type: 'string' },
        },
        required: ['company', 'title', 'years', 'highlights'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'skills', 'educations', 'experiences'],
  additionalProperties: false,
} as const;

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: '0-100 的匹配度整数分' },
    hits: { type: 'array', items: { type: 'string' }, description: '命中的岗位要求' },
    misses: { type: 'array', items: { type: 'string' }, description: '缺失的岗位要求' },
    highlights: { type: 'string', description: '候选人亮点，1-2 句' },
    risks: { type: 'string', description: '风险提示，1-2 句' },
  },
  required: ['score', 'hits', 'misses', 'highlights', 'risks'],
  additionalProperties: false,
} as const;

const EVALUATION_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    scorecard: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['技术能力', '工程素养', '沟通协作'] },
          score: { type: 'integer', description: '1-5 分' },
          comment: { type: 'string', description: '该维度的评分依据，1 句' },
        },
        required: ['dimension', 'score', 'comment'],
        additionalProperties: false,
      },
      description: '必须且只包含 技术能力/工程素养/沟通协作 三个维度',
    },
    conclusion: { type: 'string', enum: ['STRONG_YES', 'YES', 'NO', 'STRONG_NO'] },
    comments: { type: 'string', description: '综合评语草稿，100 字左右，客观中立' },
  },
  required: ['scorecard', 'conclusion', 'comments'],
  additionalProperties: false,
} as const;

const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    insight: { type: 'string', description: '一段 2-3 句的中文诊断结论，指出瓶颈并给出建议' },
  },
  required: ['insight'],
  additionalProperties: false,
} as const;

/**
 * Anthropic Messages API 引擎：结构化输出（output_config.format）保证 JSON 可解析，
 * 自适应思考按任务复杂度分配推理深度。SDK 自带超时（60s）与重试（2 次）。
 */
export class AnthropicAiEngine implements AiEngine {
  readonly name: string;
  private readonly logger = new Logger(AnthropicAiEngine.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey: string; model: string; baseURL?: string }) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: 60_000,
      maxRetries: 2,
    });
    this.model = options.model;
    this.name = `anthropic:${this.model}`;
  }

  private async completeJson<T>(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    maxTokens = 4096,
  ): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('模型拒绝了该请求（safety refusal）');
    }
    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!text) {
      throw new Error(`模型未返回文本内容（stop_reason=${response.stop_reason}）`);
    }
    return JSON.parse(text.text) as T;
  }

  async generateJd(input: JdInput): Promise<JdDraft> {
    return this.completeJson<JdDraft>(
      '你是资深招聘专家，擅长撰写专业、有吸引力、符合雇主品牌调性的中文职位描述（JD）。输出分条清晰、避免空话。',
      [
        `请为以下职位撰写 JD：`,
        `职位名称：${input.title}`,
        input.departmentName ? `所属部门：${input.departmentName}` : '',
        input.keywords ? `核心诉求/关键词：${input.keywords}` : '',
        `要求：岗位职责（description）与任职要求（requirement）分开，各自分条（1. 2. 3.…），中文。`,
      ]
        .filter(Boolean)
        .join('\n'),
      JD_SCHEMA,
    );
  }

  async parseResume(rawText: string): Promise<ParsedResume> {
    const result = await this.completeJson<ParsedResume>(
      [
        '你是简历解析引擎。把非结构化简历解析为结构化数据，并进行语义推理打标签：',
        '技能标签不能只做字面匹配——例如候选人写“精通 Vue”，应同时推导出“前端开发”“JavaScript”。',
        'summary 输出约 150 字的「亮点与风险提示」，供 HR 快速决策，客观中立。',
        '信息缺失的字段填空字符串，不要编造。',
      ].join('\n'),
      `简历全文：\n${rawText.slice(0, 12_000)}`,
      PARSED_RESUME_SCHEMA,
      6144,
    );
    result.skills = [...new Set(result.skills)].slice(0, 15);
    return result;
  }

  async scoreMatch(input: MatchInput): Promise<MatchResult> {
    const result = await this.completeJson<MatchResult>(
      [
        '你是招聘评估专家。对照 JD 与候选人材料给出 0-100 的匹配度整数分，并给出可解释的依据：',
        '命中哪些要求（hits）、缺失哪些要求（misses）、亮点与风险各 1-2 句。',
        '评分应只依据技能与经验，忽略姓名、性别、年龄、籍贯等信息（去偏见要求）。',
      ].join('\n'),
      [
        `【职位】${input.jobTitle}`,
        `【岗位职责】${input.jobDescription || '（未填写）'}`,
        `【任职要求】${input.jobRequirement || '（未填写）'}`,
        `【候选人标签】${input.candidateTags.join('、') || '（无）'}`,
        `【候选人材料】\n${input.resumeText.slice(0, 10_000)}`,
      ].join('\n'),
      MATCH_SCHEMA,
    );
    result.score = Math.max(0, Math.min(100, Math.round(result.score)));
    return result;
  }

  async draftEvaluation(input: EvaluationDraftInput): Promise<EvaluationDraft> {
    const draft = await this.completeJson<EvaluationDraft>(
      [
        '你是面试评价助手。根据面试官的原始记录，生成结构化面评草稿供面试官修改确认。',
        '评分卡固定三个维度：技术能力、工程素养、沟通协作，各 1-5 整数分。',
        '结论从 STRONG_YES/YES/NO/STRONG_NO 中选择。评语客观、基于记录、不夸大。',
        '在 comments 开头注明【AI 草稿·请修改确认】。',
      ].join('\n'),
      [
        `候选人：${input.candidateName}`,
        `职位：${input.jobTitle}（第 ${input.round} 轮面试）`,
        `面试记录：\n${input.notes.slice(0, 8_000)}`,
      ].join('\n'),
      EVALUATION_DRAFT_SCHEMA,
    );
    if (!Object.values(EvaluationConclusion).includes(draft.conclusion)) {
      draft.conclusion = EvaluationConclusion.YES;
    }
    draft.scorecard = draft.scorecard
      .filter((s) => ['技术能力', '工程素养', '沟通协作'].includes(s.dimension))
      .map((s) => ({ ...s, score: Math.max(1, Math.min(5, Math.round(s.score))) }));
    return draft;
  }

  async funnelInsight(input: FunnelInput): Promise<string> {
    const { insight } = await this.completeJson<{ insight: string }>(
      '你是招聘数据分析师。根据漏斗数据给出 2-3 句中文诊断：指出异常/瓶颈环节（对比常见基准），并给出一条可操作建议。语气专业克制。',
      `职位「${input.jobTitle}」当前漏斗（各阶段停留人数，从前到后）：${input.stages
        .map((s) => `${s.name}=${s.count}`)
        .join('，')}`,
      INSIGHT_SCHEMA,
      2048,
    );
    return insight;
  }
}
