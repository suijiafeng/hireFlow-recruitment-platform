import type { EvaluationConclusion } from '@hireflow/shared';

/** AI 生成的 JD 草稿 */
export interface JdDraft {
  description: string;
  requirement: string;
}

/** 简历结构化解析结果（语义理解，非关键词匹配） */
export interface ParsedResume {
  /** 约 150 字「候选人亮点与风险提示」 */
  summary: string;
  /** 语义推理出的技能标签（如「精通 Vue」→ 前端开发/JavaScript） */
  skills: string[];
  educations: Array<{ school: string; degree?: string; major?: string }>;
  experiences: Array<{ company: string; title?: string; years?: string; highlights?: string }>;
}

/** 岗位匹配度评分（可解释，给出命中/缺失依据） */
export interface MatchResult {
  /** 0-100 整数 */
  score: number;
  hits: string[];
  misses: string[];
  highlights: string;
  risks: string;
}

/** 面评草稿 */
export interface EvaluationDraft {
  scorecard: Array<{ dimension: string; score: number; comment: string }>;
  conclusion: EvaluationConclusion;
  comments: string;
}

export interface JdInput {
  title: string;
  departmentName?: string;
  keywords?: string;
}

export interface MatchInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirement: string;
  resumeText: string;
  candidateTags: string[];
}

export interface EvaluationDraftInput {
  candidateName: string;
  jobTitle: string;
  round: number;
  notes: string;
}

export interface FunnelInput {
  jobTitle: string;
  stages: Array<{ name: string; count: number }>;
}

export interface HelpdeskInput {
  question: string;
  docs: Array<{ title: string; content: string }>;
}

export interface RetentionInput {
  candidateName: string;
  jobTitle: string;
  tags: string[];
  matchScore?: number | null;
  summary?: string;
}

/** 留存预测（辅助参考，不做唯一依据） */
export interface RetentionHint {
  /** 0-1 的试用期留存概率 */
  probability: number;
  factors: string[];
}

/**
 * AI 能力引擎（模型可插拔）：
 * 同一接口下可切换真实 LLM（Anthropic）与确定性 Mock（无 key 时全链路可用）。
 */
export interface AiEngine {
  readonly name: string;
  generateJd(input: JdInput): Promise<JdDraft>;
  parseResume(rawText: string): Promise<ParsedResume>;
  scoreMatch(input: MatchInput): Promise<MatchResult>;
  draftEvaluation(input: EvaluationDraftInput): Promise<EvaluationDraft>;
  funnelInsight(input: FunnelInput): Promise<string>;
  /** 入职问答（HR Helpdesk）：仅依据提供的制度文档回答 */
  answerQuestion(input: HelpdeskInput): Promise<string>;
  predictRetention(input: RetentionInput): Promise<RetentionHint>;
}
