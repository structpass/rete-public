import {
  validatePassword,
  evaluatePasswordPolicy,
  type PasswordPolicyShape,
} from './password-policy';

const policy = (over: Partial<PasswordPolicyShape> = {}): PasswordPolicyShape => ({
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: false,
  minLength: 8,
  ...over,
});

describe('validatePassword', () => {
  it('全要件を満たすパスワードは違反なし（空配列）', () => {
    expect(validatePassword('Abcdef12', policy())).toEqual([]);
  });

  it('最小桁数未満は違反を返す', () => {
    const errors = validatePassword('Ab1', policy({ minLength: 8 }));
    expect(errors.some((e) => e.includes('8'))).toBe(true);
  });

  it('必須文字種が欠けていれば各々違反を返す', () => {
    expect(validatePassword('ABCDEF12', policy()).some((e) => e.includes('小文字'))).toBe(true);
    expect(validatePassword('abcdef12', policy()).some((e) => e.includes('大文字'))).toBe(true);
    expect(validatePassword('Abcdefgh', policy()).some((e) => e.includes('数字'))).toBe(true);
  });

  it('記号必須のとき記号が無ければ違反、あれば合格', () => {
    expect(
      validatePassword('Abcdef12', policy({ requireSymbol: true })).some((e) => e.includes('記号')),
    ).toBe(true);
    expect(validatePassword('Abcdef1!', policy({ requireSymbol: true }))).toEqual([]);
  });

  it('記号不要なら記号無しでも合格', () => {
    expect(validatePassword('Abcdef12', policy({ requireSymbol: false }))).toEqual([]);
  });

  it('複数違反は累積して返す', () => {
    const errors = validatePassword('abc', policy({ requireSymbol: true, minLength: 8 }));
    expect(errors.length).toBeGreaterThanOrEqual(3); // 桁・大文字・数字・記号
  });
});

describe('evaluatePasswordPolicy（inline チェックリスト用・shared SSOT）', () => {
  it('minLength は常に含み、必須文字種フラグの分だけルールが並ぶ', () => {
    const rules = evaluatePasswordPolicy('', policy({ requireSymbol: true }));
    expect(rules.map((r) => r.id)).toEqual([
      'minLength',
      'uppercase',
      'lowercase',
      'number',
      'symbol',
    ]);
  });

  it('非必須の文字種ルールはチェックリストに出さない', () => {
    const rules = evaluatePasswordPolicy('', {
      requireLowercase: false,
      requireUppercase: false,
      requireNumber: false,
      requireSymbol: false,
      minLength: 8,
    });
    expect(rules.map((r) => r.id)).toEqual(['minLength']);
  });

  it('minLength ラベルはポリシー値を反映し、境界（ちょうど minLength）で満たす', () => {
    const rules8 = evaluatePasswordPolicy('Abcdef12', policy({ minLength: 8 }));
    const min = rules8.find((r) => r.id === 'minLength')!;
    expect(min.label).toBe('8文字以上');
    expect(min.satisfied).toBe(true);
    // 1 文字不足は未満たし。
    const short = evaluatePasswordPolicy('Abcdef1', policy({ minLength: 8 }));
    expect(short.find((r) => r.id === 'minLength')!.satisfied).toBe(false);
  });

  it('各文字種ルールの satisfied が入力に応じて切り替わる', () => {
    const rules = evaluatePasswordPolicy('abcdefgh', policy({ requireSymbol: true }));
    const byId = Object.fromEntries(rules.map((r) => [r.id, r.satisfied]));
    expect(byId.lowercase).toBe(true);
    expect(byId.uppercase).toBe(false);
    expect(byId.number).toBe(false);
    expect(byId.symbol).toBe(false);
  });

  it('全項目を満たすと全 satisfied=true（validatePassword 空配列と整合）', () => {
    const p = policy({ requireSymbol: true });
    const rules = evaluatePasswordPolicy('Abcdef1!', p);
    expect(rules.every((r) => r.satisfied)).toBe(true);
    expect(validatePassword('Abcdef1!', p)).toEqual([]);
  });
});
