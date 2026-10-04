import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractCspNonce, warnIfCspNonceMissing } from '../csp-nonce';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// cmn-0383（cmn-0351 検証フォローアップ）: nonce 伝搬の critical path である抽出側を固定する。
// 生成側（middleware の buildCsp）は middleware.test.ts が固定済みだが、抽出側は無防備だった。
// 壊れても console violation とスタイル欠落としてしか現れず検出が遅いため、境界 5 観点を押さえる。

const NONCE = 'YWJjZGVmZ2hpamtsbW5vcA==';

describe('extractCspNonce（cmn-0383）', () => {
  it('script-src の nonce を優先して返す（default-src にも nonce がある時）', () => {
    const csp = [
      `default-src 'self' 'nonce-ZGVmYXVsdC1zcmM='`,
      `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`,
      `style-src 'self' 'unsafe-inline'`,
    ].join('; ');
    expect(extractCspNonce(csp)).toBe(NONCE);
  });

  it('script-src が無ければ default-src へフォールバックする', () => {
    const csp = [`default-src 'self' 'nonce-${NONCE}'`, `img-src 'self' data:`].join('; ');
    expect(extractCspNonce(csp)).toBe(NONCE);
  });

  it('nonce の書式が壊れていれば無視する（空 / 不正文字 / 閉じ引用符なし）', () => {
    expect(extractCspNonce(`script-src 'self' 'nonce-'`)).toBeNull();
    expect(extractCspNonce(`script-src 'self' 'nonce-abc$def'`)).toBeNull();
    expect(extractCspNonce(`script-src 'self' 'nonce-${NONCE}`)).toBeNull();
  });

  it('nonce に該当するソースが無ければ null を返す', () => {
    expect(extractCspNonce(`script-src 'self' 'strict-dynamic'`)).toBeNull();
    expect(extractCspNonce(`default-src 'self'`)).toBeNull();
    expect(extractCspNonce('')).toBeNull();
  });

  it('前方一致するだけの別ディレクティブ（script-src-elem 等）から誤抽出しない', () => {
    // script 用の nonce が無く elem 側だけに nonce がある CSP。前方一致で引くと
    // script-src-elem の nonce を script の nonce として返してしまう。
    const csp = [
      `default-src 'self'`,
      `script-src-elem 'self' 'nonce-ZWxlbS1vbmx5'`,
      `style-src-elem 'self' 'nonce-c3R5bGUtZWxlbQ=='`,
    ].join('; ');
    expect(extractCspNonce(csp)).toBeNull();

    // script-src-elem が script-src より先に並んでも、拾うのは script-src の nonce。
    const ordered = [
      `script-src-elem 'self' 'nonce-ZWxlbS1maXJzdA=='`,
      `script-src 'self' 'nonce-${NONCE}'`,
    ].join('; ');
    expect(extractCspNonce(ordered)).toBe(NONCE);
  });

  it('rete が実際に発行する本番 CSP から nonce を取り出せる（生成側 buildCsp と結線）', async () => {
    // 形状を手写しすると buildCsp のディレクティブ構成が変わっても緑のままになるため、
    // 生成元をそのまま呼ぶ（middleware.test.ts と同じ env 差し替え方式）。
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    const { buildCsp } = await import('@/middleware');
    expect(extractCspNonce(buildCsp(NONCE))).toBe(NONCE);
  });

  it('ディレクティブ区切りがタブ・連続スペースでも抽出でき、ディレクティブ名の大文字小文字に依存しない（criteria 2）', () => {
    const csp = [
      `default-src 'self'`,
      `\tscript-src\t  'self'    'nonce-${NONCE}'   'strict-dynamic'`,
      `style-src 'self' 'unsafe-inline'`,
    ].join(';\t');
    expect(extractCspNonce(csp)).toBe(NONCE);

    const upper = [`SCRIPT-SRC 'self' 'nonce-${NONCE}'`, `default-src 'self'`].join('; ');
    expect(extractCspNonce(upper)).toBe(NONCE);
  });

  it('script-src は在るが nonce を含まず、default-src に nonce が在る → null（Next.js 準拠で降りない・criteria 3）', () => {
    const csp = [
      `default-src 'self' 'nonce-ZGVmYXVsdC1zcmM='`,
      `script-src 'self' 'strict-dynamic'`,
      `style-src 'self' 'unsafe-inline'`,
    ].join('; ');
    expect(extractCspNonce(csp)).toBeNull();
  });
});

describe('warnIfCspNonceMissing（cmn-0383）', () => {
  it('本番（NODE_ENV=production）で CSP ヘッダがあるのに抽出が null の時、警告を 1 回だけ出す（毎リクエストは出ない）', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.fn();
    // 検出条件が恒常化しても、ラッチにより 2 回目以降は警告しない（criteria 1）。
    warnIfCspNonceMissing(`default-src 'self'; script-src 'self' 'strict-dynamic'`, warn);
    warnIfCspNonceMissing(`default-src 'self'; script-src 'self' 'strict-dynamic'`, warn);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('本番でも nonce が抽出できれば警告しない', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.fn();
    warnIfCspNonceMissing(`script-src 'self' 'nonce-${NONCE}'`, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('CSP ヘッダが無ければ警告しない', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.fn();
    warnIfCspNonceMissing(null, warn);
    warnIfCspNonceMissing('', warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('dev では警告しない（nonce を出さない設計のため恒常アラーム化を避ける）', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.fn();
    warnIfCspNonceMissing(`default-src 'self'; script-src 'self' 'strict-dynamic'`, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});
