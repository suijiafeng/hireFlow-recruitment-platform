/**
 * 联系方式部分遮蔽。
 *
 * 早先的做法是整串替换成「（已脱敏）」，等于把字段抹成一句无信息的中文：
 * 面试官既认不出这是谁的联系方式，也无法和候选人自己报的号码做核对，
 * 而遮蔽的本意只是「不可直接外传」，不是「不可辨识」。
 * 因此保留头尾的少量特征位，中间固定用三个 * —— 星号数量不随原文长度变化，
 * 否则长度本身就成了可被反推的信息。
 */

const STARS = '***';

/** 手机号/座机：保留前 3 后 4，形如 138***8888；位数不足则退化为只留首尾各一位 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 8) {
    return `${digits.slice(0, 3)}${STARS}${digits.slice(-4)}`;
  }
  if (digits.length >= 3) {
    return `${digits.slice(0, 1)}${STARS}${digits.slice(-1)}`;
  }
  return STARS;
}

/** 邮箱：本地部分保留前 2 位，域名完整保留（域名不构成个人标识，且是核对时的关键线索） */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return STARS;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length >= 3 ? local.slice(0, 2) : local.slice(0, 1);
  return `${keep}${STARS}${domain}`;
}
