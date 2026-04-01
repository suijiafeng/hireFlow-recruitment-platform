import type { DocumentType } from '@hireflow/shared';

/**
 * OCR 服务抽象（云厂商 OCR 通过此接口接入）。
 * Mock 实现用正则从粘贴文本中抽取关键字段；接入真实 OCR 后输入将换成图片。
 */
export interface OcrProvider {
  readonly name: string;
  parse(type: DocumentType, rawText: string): Promise<Record<string, string>>;
}

export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock-ocr';

  async parse(type: DocumentType, rawText: string): Promise<Record<string, string>> {
    const text = rawText.replace(/\s+/g, ' ');
    const name = text.match(/姓名[:：]?\s*([一-龥]{2,6})/)?.[1];

    if (type === 'ID_CARD') {
      return this.compact({
        name,
        idNumber: text.match(/(\d{17}[\dXx])/)?.[1],
        address: text.match(/(?:住址|地址)[:：]?\s*([一-龥0-9]{6,40})/)?.[1],
        birth: text.match(/(?:出生)[:：]?\s*(\d{4}[年.-]\d{1,2}[月.-]\d{1,2})/)?.[1],
      });
    }
    if (type === 'BANK_CARD') {
      return this.compact({
        name,
        cardNumber: text.match(/(\d{16,19})/)?.[1],
        bank: text.match(/([一-龥]{2,10}银行)/)?.[1],
      });
    }
    return this.compact({
      name,
      // 字符类排除“毕业于/就读于”等连接词，避免贪婪匹配把前缀吞进校名
      school: text.match(/([^\s，。、于毕就读]{2,12}(?:大学|学院))/)?.[1],
      degree: text.match(/(博士|硕士|研究生|本科|大专)/)?.[1],
      major: text.match(/(?:专业)[:：]?\s*([一-龥a-zA-Z]{2,16})/)?.[1],
      graduation: text.match(/(\d{4})\s*年?\s*(?:毕业|结业)/)?.[1],
    });
  }

  private compact(fields: Record<string, string | undefined>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  }
}
