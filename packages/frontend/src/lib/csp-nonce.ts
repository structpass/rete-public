/**
 * 実行時に <style> を注入するライブラリ（goober=トースト / react-colorful / tiptap）へ
 * CSP nonce を渡すためのクライアント／サーバー両用の CSP nonce ヘルパ（cmn-0351 / cmn-0383）。
 * クライアント側は window.__nonce__ の読み取り、サーバー側は CSP ヘッダからの抽出を担う。
 * nonce の生成は middleware 1 箇所・伝搬は CSP ヘッダ→ layout の inline script が
 * window.__nonce__ へ設定する経路のみ（第 2 の伝搬経路は作らない）。
 */
export function getClientCspNonce(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { __nonce__?: string }).__nonce__;
}

/**
 * CSP ヘッダから最初の有効な nonce を抽出する（cmn-0351）。上の伝搬経路のサーバー側の起点で、
 * app/layout.tsx が middleware の発行したヘッダから nonce を取り出すのに使う。
 * Next.js 自身の抽出（app-render.js が使う get-script-nonce-from-header）と同じ正規表現・
 * script-src → default-src の fallback 順を踏襲する。抽出のみで nonce は生成しない。
 *
 * cmn-0383: ディレクティブ名は完全一致で引く。前方一致（startsWith('script-src')）だと
 * `script-src-elem` が先に並ぶ CSP で script 用でない nonce を拾う（Next.js 本家は前方一致だが、
 * こちらは style-src-elem / style-src-attr を発行する CSP を自前で組んでいるため境界を締める）。
 * 区切りは WSP（タブ・連続スペース）と ASCII case-insensitive に対応する（ソース側の
 * directive.split(/\s+/) と同じ WSP 解釈で、ディレクティブ名の大文字小文字も区別しない）。
 *
 * layout.tsx 内の private 関数から本ファイルへ移した（cmn-0383）。layout.tsx は next/font の
 * Geist(...) をモジュール読み込み時に実行するため、そのまま import すると vitest で解決できず
 * 単体テストを書けなかった。利用箇所は layout.tsx 1 箇所のままで、移設の目的は検出線を引くこと。
 */
export function extractCspNonce(csp: string): string | null {
  const nonceSourceRegex = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;
  const directives = csp.split(';').map((d) => d.trim());
  // ディレクティブ名は WSP（タブ・連続スペース）区切り・ASCII case-insensitive で完全一致。
  // script-src-elem 等の前方一致だけの別ディレクティブからは拾わない（境界を締める）。
  // 値の有無は問わない（script-src が在れば default-src へフォールバックしない・Next.js 準拠）。
  const findDirective = (name: string) =>
    directives.find((d) => d.split(/\s+/)[0].toLowerCase() === name);
  const directive = findDirective('script-src') || findDirective('default-src');
  if (!directive) return null;
  for (const source of directive.split(/\s+/).slice(1)) {
    const match = source.trim().match(nonceSourceRegex);
    if (match) return match[1];
  }
  return null;
}

/**
 * 本番で CSP ヘッダがあるのに nonce 抽出が null に落ちたことを console 警告で可視化する（cmn-0383）。
 * goober のトースト等は実行時に <style> を nonce 付きで注入するため、抽出失敗は「スタイルが
 * 無言で欠落する」だけでエラーにならない。検出線として、本番のみ・初回 1 回だけ警告する。
 * dev は nonce をそもそも出さない設計（middleware の script-src が unsafe-inline）のため、
 * dev 限定だと全ページ毎回鳴る恒常アラームになり検出線として機能しない＝本番限定が正しい。
 * 既存の http 混入警告（cmn-0349）と同じ流儀。呼び出し元は app/layout.tsx。
 * 初回 1 回ラッチは middleware.ts の warnIfProductionHttpMixed（cmn-0349）と同じ module レベル
 * フラグで実装し、検出条件が成立してもリクエスト毎に鳴らさない。
 */
let warnedNonceMissing = false;
export function warnIfCspNonceMissing(
  csp: string | null,
  warn: (msg: string) => void = console.warn,
): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (!csp) return;
  if (extractCspNonce(csp) !== null || warnedNonceMissing) return;
  warnedNonceMissing = true;
  warn(
    '[csp] CSP ヘッダが存在するのに nonce を抽出できませんでした。goober のトースト等の' +
      '動的スタイル注入が無言で壊れる可能性があります（cmn-0383）。',
  );
}
