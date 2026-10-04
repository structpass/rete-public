import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PASSWORD_POLICY,
  validatePassword,
  evaluatePasswordPolicy,
  type PasswordPolicyShape,
} from './password-policy';
// barrel 契約（criteria 11）: backend/frontend は @rete/shared 直 import（=top-level barrel）で
// これらを取得するため、re-export 切れは即事故。src 相対で top-level index を叩いて存在を固定する。
import * as sharedRoot from '../index';

/** テスト用にキー全 true のポリシーを組む（minLength 可変）。 */
const allRequired = (minLength: number): PasswordPolicyShape => ({
  minLength,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: true,
});

describe('DEFAULT_PASSWORD_POLICY (criteria 7)', () => {
  it('既定値を凍結する', () => {
    expect(DEFAULT_PASSWORD_POLICY).toEqual({
      minLength: 8,
      requireLowercase: false,
      requireUppercase: false,
      requireNumber: false,
      requireSymbol: false,
    });
  });

  it('キー数は 5（フィールド増減検知）', () => {
    expect(Object.keys(DEFAULT_PASSWORD_POLICY)).toHaveLength(5);
  });
});

describe('validatePassword (criteria 8)', () => {
  it('①合格時は空配列を返す（真偽値ではない）', () => {
    const result = validatePassword('abcdefgh', DEFAULT_PASSWORD_POLICY);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('②長さ境界は >=（minLength=8 で 7 文字 NG / 8 文字 OK）', () => {
    expect(validatePassword('1234567', DEFAULT_PASSWORD_POLICY)).toEqual([
      'パスワードは 8 文字以上にしてください',
    ]);
    expect(validatePassword('12345678', DEFAULT_PASSWORD_POLICY)).toEqual([]);
  });

  it('③各フラグ false のとき該当文字種が無くてもエラーを出さない', () => {
    // 記号・数字・大小文字を一切含まない 8 文字でも DEFAULT（全 false）では合格。
    expect(validatePassword('aaaaaaaa', DEFAULT_PASSWORD_POLICY)).toEqual([]);
  });

  it('④各フラグ true のとき該当メッセージを個別に出す', () => {
    const base = allRequired(1); // 長さ違反を混ぜないため minLength=1
    expect(
      validatePassword('A1!', {
        ...base,
        requireLowercase: true,
        requireUppercase: false,
        requireNumber: false,
        requireSymbol: false,
      }),
    ).toEqual(['小文字英字を 1 文字以上含めてください']);
    expect(
      validatePassword('a1!', {
        ...base,
        requireLowercase: false,
        requireUppercase: true,
        requireNumber: false,
        requireSymbol: false,
      }),
    ).toEqual(['大文字英字を 1 文字以上含めてください']);
    expect(
      validatePassword('aA!', {
        ...base,
        requireLowercase: false,
        requireUppercase: false,
        requireNumber: true,
        requireSymbol: false,
      }),
    ).toEqual(['数字を 1 文字以上含めてください']);
    expect(
      validatePassword('aA1', {
        ...base,
        requireLowercase: false,
        requireUppercase: false,
        requireNumber: false,
        requireSymbol: true,
      }),
    ).toEqual(['記号を 1 文字以上含めてください']);
  });

  it('⑤複数違反は全件積まれ順序は minLength → 小文字 → 大文字 → 数字 → 記号', () => {
    // 空文字 × 全 true → 5 件すべて違反。
    expect(validatePassword('', allRequired(8))).toEqual([
      'パスワードは 8 文字以上にしてください',
      '小文字英字を 1 文字以上含めてください',
      '大文字英字を 1 文字以上含めてください',
      '数字を 1 文字以上含めてください',
      '記号を 1 文字以上含めてください',
    ]);
  });

  it('⑥記号定義は [^A-Za-z0-9]＝空白・全角文字も記号として合格扱い（現仕様の凍結）', () => {
    const policy: PasswordPolicyShape = {
      minLength: 1,
      requireLowercase: false,
      requireUppercase: false,
      requireNumber: false,
      requireSymbol: true,
    };
    expect(validatePassword(' ', policy)).toEqual([]); // 半角空白
    expect(validatePassword('あ', policy)).toEqual([]); // 全角文字
  });

  it('⑦引数の policy オブジェクトを変更しない', () => {
    const policy = allRequired(8);
    const snapshot = JSON.parse(JSON.stringify(policy));
    validatePassword('', policy);
    expect(policy).toEqual(snapshot);
  });
});

describe('evaluatePasswordPolicy (criteria 9)', () => {
  it('①minLength 行は常に先頭かつ常に存在（全 false でも）', () => {
    const rows = evaluatePasswordPolicy('x', DEFAULT_PASSWORD_POLICY);
    expect(rows[0].id).toBe('minLength');
  });

  it('②文字種行は require* が true のものだけ含む', () => {
    const onlyUpper = evaluatePasswordPolicy('x', {
      ...DEFAULT_PASSWORD_POLICY,
      requireUppercase: true,
    });
    expect(onlyUpper.map((r) => r.id)).toEqual(['minLength', 'uppercase']);
  });

  it('③行順は minLength → uppercase → lowercase → number → symbol（validate と大小が逆の現仕様を固定）', () => {
    const rows = evaluatePasswordPolicy('x', allRequired(8));
    expect(rows.map((r) => r.id)).toEqual([
      'minLength',
      'uppercase',
      'lowercase',
      'number',
      'symbol',
    ]);
  });

  it('④id は許可された literal のいずれか', () => {
    const rows = evaluatePasswordPolicy('x', allRequired(8));
    const allowed = ['minLength', 'uppercase', 'lowercase', 'number', 'symbol'];
    for (const r of rows) expect(allowed).toContain(r.id);
  });

  it('⑤label 文字列を凍結（画面はこの label をそのまま描画する）', () => {
    const rows = evaluatePasswordPolicy('x', allRequired(8));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.label]));
    expect(byId.minLength).toBe('8文字以上');
    expect(byId.uppercase).toBe('大文字を含む');
    expect(byId.lowercase).toBe('小文字を含む');
    expect(byId.number).toBe('数字を含む');
    expect(byId.symbol).toBe('記号を含む');
  });

  it('⑤minLength label は policy.minLength を反映する', () => {
    const rows = evaluatePasswordPolicy('x', { ...DEFAULT_PASSWORD_POLICY, minLength: 12 });
    expect(rows[0].label).toBe('12文字以上');
  });

  it('⑥全 false ポリシーなら1行だけ返す', () => {
    expect(evaluatePasswordPolicy('x', DEFAULT_PASSWORD_POLICY)).toHaveLength(1);
  });

  it('satisfied は長さ >= と各文字種の有無を反映する', () => {
    const rows = evaluatePasswordPolicy('aB3!x', allRequired(4));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.satisfied]));
    expect(byId.minLength).toBe(true); // length 5 >= 4
    expect(byId.uppercase).toBe(true);
    expect(byId.lowercase).toBe(true);
    expect(byId.number).toBe(true);
    expect(byId.symbol).toBe(true);
    const short = evaluatePasswordPolicy('ab', allRequired(4));
    expect(short.find((r) => r.id === 'minLength')!.satisfied).toBe(false);
  });
});

describe('相互整合の契約 — evaluate.every(satisfied) ⇔ validate.length===0 (criteria 10)', () => {
  // 画面の送信可否（allSatisfied）とサーバ 422（validate）が割れると「緑なのに弾かれる」が起きる。
  const policies: Record<string, PasswordPolicyShape> = {
    default: DEFAULT_PASSWORD_POLICY,
    allTrue8: allRequired(8),
    upperOnly: { ...DEFAULT_PASSWORD_POLICY, requireUppercase: true },
    symbolOnly: {
      minLength: 1,
      requireLowercase: false,
      requireUppercase: false,
      requireNumber: false,
      requireSymbol: true,
    },
  };
  const passwords = ['', 'abc', 'abcdefgh', 'Abcdefg1', 'Abcdefg1!', ' ', 'あいうえお', 'ABCDEFGH'];

  const combos: Array<[string, string]> = [];
  for (const pw of passwords) for (const pk of Object.keys(policies)) combos.push([pw, pk]);

  it.each(combos)('pw=%j policy=%s で allSatisfied と validate 合格が一致', (pw, pk) => {
    const policy = policies[pk];
    const allSatisfied = evaluatePasswordPolicy(pw, policy).every((r) => r.satisfied);
    const validatePasses = validatePassword(pw, policy).length === 0;
    expect(allSatisfied).toBe(validatePasses);
  });

  it('組合せは 12 以上ある（criteria 10 の下限）', () => {
    expect(combos.length).toBeGreaterThanOrEqual(12);
  });
});

describe('barrel 契約 (criteria 11)', () => {
  it('top-level index が SSOT シンボルを re-export している', () => {
    expect(sharedRoot.validatePassword).toBe(validatePassword);
    expect(sharedRoot.evaluatePasswordPolicy).toBe(evaluatePasswordPolicy);
    expect(sharedRoot.DEFAULT_PASSWORD_POLICY).toBe(DEFAULT_PASSWORD_POLICY);
  });
});
