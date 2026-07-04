import { maskEmail, maskPhone } from './mask';

describe('maskPhone', () => {
  it('保留前 3 后 4', () => {
    expect(maskPhone('13910000000')).toBe('139***0000');
  });

  it('忽略分隔符只看数字', () => {
    expect(maskPhone('139-1000-0000')).toBe('139***0000');
  });

  it('短号退化为首尾各一位', () => {
    expect(maskPhone('10086')).toBe('1***6');
  });

  it('过短则整串遮蔽', () => {
    expect(maskPhone('12')).toBe('***');
  });

  it('星号数量固定，不随原文长度变化（长度本身也是信息）', () => {
    const stars = (s: string) => s.match(/\*+/)![0].length;
    expect(stars(maskPhone('13900000000'))).toBe(stars(maskPhone('139000000000009')));
  });
});

describe('maskEmail', () => {
  it('保留本地部分前 2 位与完整域名', () => {
    expect(maskEmail('zhenghao@example.com')).toBe('zh***@example.com');
  });

  it('本地部分过短时只保留 1 位', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
  });

  it('非法邮箱整串遮蔽', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });
});
