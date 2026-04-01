/**
 * 电子签服务抽象（法大大 / e签宝 / DocuSign 皆通过此接口接入）。
 * 三期先用 Mock 兜底（接口层抽象，先人工/模拟兜底，逐步替换）。
 */
export interface EsignProvider {
  readonly name: string;
  /** 发起签署，返回服务商侧单据号 */
  send(input: { contractId: string; content: string }): Promise<{ providerRef: string }>;
  /** 完成签署，返回存证号 */
  sign(input: { contractId: string }): Promise<{ evidenceNo: string; signedAt: Date }>;
}

export class MockEsignProvider implements EsignProvider {
  readonly name = 'mock-esign';

  async send(input: { contractId: string; content: string }): Promise<{ providerRef: string }> {
    return { providerRef: `MOCKSIGN-${input.contractId.slice(-8).toUpperCase()}` };
  }

  async sign(input: { contractId: string }): Promise<{ evidenceNo: string; signedAt: Date }> {
    const stamp = Date.now().toString(36).toUpperCase();
    return {
      evidenceNo: `EVID-MOCK-${stamp}-${input.contractId.slice(-6).toUpperCase()}`,
      signedAt: new Date(),
    };
  }
}
