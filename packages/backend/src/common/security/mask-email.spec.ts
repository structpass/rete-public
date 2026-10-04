import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('ローカル部を *** に置換しドメインは残す', () => {
    expect(maskEmail('admin@rete.local')).toBe('***@rete.local');
  });

  it('ローカル部が長くても一律 *** に潰す（長さで PII が推測できないようにする）', () => {
    expect(maskEmail('very.long.local.part@example.com')).toBe('***@example.com');
  });

  it('@ を含まない不正な入力は全体を *** にする', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('@ が先頭の不正な入力も全体を *** にする', () => {
    expect(maskEmail('@example.com')).toBe('***');
  });
});
