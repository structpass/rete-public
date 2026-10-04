// テスト実行時のタイムゾーン（UTC 固定）は vitest.config.ts の test.env.TZ が持つ。
// cmn-0262: ここ（setupFiles）にあった process.env.TZ = 'UTC' の代入は config 側へ移した。
// setupFiles は「モジュール評価」の場なので、ESM の import 巻き上げにより同ファイルの import が
// 代入より先に走る＝将来ここへ「モジュール初期化時に時刻軸を掴む依存」（module scope の
// new Intl.DateTimeFormat / 固定 Date 等）が 1 本入ると、そこだけホストの TZ を掴む。
// test.env は環境セットアップ時に適用されるため、この評価順の議論自体が消える。
// 理由・禁止事項（JST へ固定してはいけない）は vitest.config.ts のコメントを参照。

import '@testing-library/jest-dom';
import { afterEach, afterAll } from 'vitest';

// cmn-0420: 実ネットワーク遮断ガード（fail-closed）。モックされていない API 呼び出しがテストから実
// ネットワークへ飛ぶと、CI（backend 不在）では接続失敗が AggregateError として stderr に積もるだけで
// テストは緑のまま、ローカルでは dev backend に偶然成功して flaky の温床になる。ここで fetch と
// XMLHttpRequest の両方を遮断し（axios は jsdom では XHR adapter を使うため fetch スタブだけでは
// 防げない）、試行をフラグ記録して afterEach で失敗させる（コンポーネントが reject を握り潰しても、
// 非同期の遅延発火でも、テスト失敗として顕在化する）。自前で fetch をスタブするテストは自ファイル内の
// 上書きがそのまま優先される（本ガードと競合しない）。
const networkAttempts: string[] = [];

globalThis.fetch = ((input: RequestInfo | URL) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;
  networkAttempts.push(`fetch: ${url}`);
  return Promise.reject(
    new Error(`[cmn-0420] テストから実ネットワーク呼び出し（fetch）: ${url} — モック漏れを塞ぐこと`),
  );
}) as typeof fetch;

class BlockedXMLHttpRequest {
  private url = '';
  open(_method: string, url: string | URL) {
    this.url = String(url);
  }
  setRequestHeader() {}
  getAllResponseHeaders() {
    return '';
  }
  addEventListener() {}
  removeEventListener() {}
  abort() {}
  upload = { addEventListener() {}, removeEventListener() {} };
  send() {
    networkAttempts.push(`XHR: ${this.url}`);
    throw new Error(
      `[cmn-0420] テストから実ネットワーク呼び出し（XHR）: ${this.url} — モック漏れを塞ぐこと`,
    );
  }
}
globalThis.XMLHttpRequest = BlockedXMLHttpRequest as unknown as typeof XMLHttpRequest;

// beforeEach でのクリアは置かない（fail-closed 優先）: afterEach の判定後に遅延発火した試行
// （テスト終了後の microtask / timer・auto-cleanup 内の呼び出し）も記録に残り、次のテストの
// afterEach か最終の afterAll が必ず拾う。帰属が 1 テストずれうるが、メッセージの URL で追跡できる。
function assertNoNetworkAttempts() {
  if (networkAttempts.length > 0) {
    const urls = [...new Set(networkAttempts)].join(', ');
    networkAttempts.length = 0;
    throw new Error(
      `[cmn-0420] モックされていない実ネットワーク呼び出しがテスト中に発生: ${urls}`,
    );
  }
}
afterEach(assertNoNetworkAttempts);
afterAll(assertNoNetworkAttempts);

// jsdom polyfill: Tiptap/ProseMirror（Placeholder の viewport tracking 等）が呼ぶが jsdom 未実装の API。
// 本番ブラウザには存在するため、テスト環境のみの補完（no-op で安全）。
if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  // @ts-expect-error jsdom の Range に欠けるメソッドを no-op 補完
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  // @ts-expect-error 同上
  Range.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
