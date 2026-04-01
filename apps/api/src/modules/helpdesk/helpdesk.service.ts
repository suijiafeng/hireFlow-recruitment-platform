import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 入职问答机器人（HR Helpdesk）：
 * RAG-lite —— 关键词检索公司制度文档，命中文档交给 AI 引擎作答并带出处。
 * （向量检索三期后接 pgvector/Milvus 时替换 retrieve 实现即可）
 */
@Injectable()
export class HelpdeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async listDocs() {
    return this.prisma.companyDoc.findMany({
      select: { id: true, title: true, tags: true, updatedAt: true },
      orderBy: { title: 'asc' },
    });
  }

  async ask(question: string) {
    const docs = await this.prisma.companyDoc.findMany();
    const scored = docs
      .map((doc) => ({ doc, score: this.scoreDoc(question, doc) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const { data, meta } = await this.ai.answerQuestion({
      question,
      docs: scored.map(({ doc }) => ({ title: doc.title, content: doc.content })),
    });
    return {
      answer: data,
      sources: scored.map(({ doc }) => ({ id: doc.id, title: doc.title })),
      aiMeta: meta,
    };
  }

  /** 简易中文检索评分：标签命中权重最高，其次标题字重叠、正文包含 */
  private scoreDoc(question: string, doc: { title: string; content: string; tags: string[] }): number {
    let score = 0;
    for (const tag of doc.tags) {
      if (question.includes(tag)) score += 5;
    }
    for (const ch of new Set(doc.title.split(''))) {
      if (/[一-龥a-zA-Z]/.test(ch) && question.includes(ch)) score += 1;
    }
    // 提取问题中的 2-gram 检查正文命中
    for (let i = 0; i < question.length - 1; i++) {
      const gram = question.slice(i, i + 2);
      if (/^[一-龥]{2}$/.test(gram) && doc.content.includes(gram)) score += 0.5;
    }
    return score;
  }
}
