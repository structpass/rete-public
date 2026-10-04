import { validateReorderSet } from './validate-reorder-set';

describe('validateReorderSet（cmn-0151・集合検証の共通化）', () => {
  const current = ['f1', 'f2', 'f3'];

  it('過不足なし（一致）は true', () => {
    expect(validateReorderSet(current, ['f3', 'f1', 'f2'])).toBe(true);
    expect(validateReorderSet(current, current)).toBe(true);
  });

  it('過剰（余計な id が混入）は false', () => {
    expect(validateReorderSet(current, ['f1', 'f2', 'f3', 'f4'])).toBe(false);
  });

  it('欠落（id が足りない）は false', () => {
    expect(validateReorderSet(current, ['f1', 'f2'])).toBe(false);
  });

  it('すり替え（存在しない id へ差し替え）は false', () => {
    expect(validateReorderSet(current, ['f1', 'f2', 'x9'])).toBe(false);
  });

  it('重複（集合は一致するが長さが違う）は false', () => {
    // ['f1','f1','f2'] は Set 化で {f1,f2} に潰れ size 比較だけでは通る＝長さ突き合わせで弾く（cmn-0050 C4 の穴）。
    expect(validateReorderSet(['f1', 'f2'], ['f1', 'f1', 'f2'])).toBe(false);
    expect(validateReorderSet(current, ['f1', 'f1', 'f2', 'f3'])).toBe(false);
  });

  it('数値 id でも同じ判定に落ちる（categories 用）', () => {
    expect(validateReorderSet([10, 20, 30], [30, 10, 20])).toBe(true);
    expect(validateReorderSet([10, 20, 30], [10, 10, 30])).toBe(false);
    expect(validateReorderSet([10, 20, 30], [10, 20, 40])).toBe(false);
  });

  it('空一覧は空一覧同士だけ true', () => {
    expect(validateReorderSet([], [])).toBe(true);
    expect(validateReorderSet([], ['f1'])).toBe(false);
    expect(validateReorderSet(['f1'], [])).toBe(false);
  });
});
