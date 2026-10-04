/**
 * 設定タブの一覧画面の「絞り込み帯 → アクション行 → 表」の並び順を検査するための共通ヘルパ（set-0150）。
 *
 * set-0152 までは操作ログのテストにしか順序 assert が無く、他画面は `closest()` の帰属だけを
 * 見ていた（＝アクション行が表より下へ動いても緑のまま）。3 画面で強度を揃えるため共通化した。
 *
 * set-0155:
 * - 各セレクタの**先頭要素だけ**を document 順で拾う（全件の完全一致比較をやめる）。将来どこかの
 *   画面に 2 つ目の表や帯が増えても、並び順と無関係な理由でテストが落ちない（相対順序だけを見る）。
 * - このファイルはテストではないので vitest へ依存しない。順序の配列を返すだけにし、合否の判定
 *   （toEqual）は呼び出し側のテストが行う（既存の同種ヘルパ test-utils/flush.ts が vitest を
 *   避けているのと同じ線）。
 *
 * 帰属チェック（`closest('.sp-filter-bar')` が null 等）と併用する前提の**追加**の検査で、
 * 置き換えではない。帰属は「帯の中に無い」を、こちらは「表の上にある」を担う。
 * 期待値は呼び出し側で `expect(getListLayoutOrder(container)).toEqual(['sp-filter-bar',
 * 'sp-list-action-row', 'table'])` と書く。
 */
const LIST_LAYOUT_SELECTORS = ['.sp-filter-bar', '.sp-list-action-row', 'table'] as const;

export function getListLayoutOrder(container: HTMLElement): string[] {
  // 各種類の先頭要素だけを対象にし、document 順（compareDocumentPosition）で並べて種別名を返す。
  const firsts = LIST_LAYOUT_SELECTORS.flatMap((sel) => {
    const el = container.querySelector(sel);
    return el ? [{ name: sel.replace(/^\./, ''), el }] : [];
  });
  firsts.sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  return firsts.map((f) => f.name);
}

/**
 * v2-180: 一覧の「アクション行 + 表」が同じ幅の列に収まっているかを検査するための共通ヘルパ。
 *
 * アクション行の右寄せは `.sp-list-action-row-actions` の `margin-left: auto` が担うため、行の幅が
 * 表の幅と違うと CSV 出力などのボタンだけが表の右端から外れて宙に浮く（実測: メンバー 473px /
 * 招待 393px / 操作ログ 253px ずれ）。表を max-width で絞る画面（v2-180 の3画面）は、行と表を
 * 同じ枠へ入れて右端を揃えている。その枠（アクション行の親）を返す。順序ヘルパと同じく判定は
 * 呼び出し側が行い、期待値は `expect(getListColumn(container)?.style.maxWidth).toBe('680px')` と
 * `expect(getListColumn(container)?.contains(container.querySelector('table'))).toBe(true)` の2点で見る。
 */
export function getListColumn(container: HTMLElement): HTMLElement | null {
  const row = container.querySelector('.sp-list-action-row');
  return row ? (row.parentElement as HTMLElement | null) : null;
}

/**
 * v2-180: 表を持たない設定画面のフォームが、内容に合う幅の枠へ収まっているかを検査するための共通ヘルパ。
 *
 * 表の無い4画面（ログイン設定・テナント設定・アップロード設定・表示設定）は、全幅(1153px)のままだと
 * 入力欄と本文が離れて間延びして見える。フォームカードを max-width の枠へ入れて左寄せにしているので、
 * その枠（先頭カードの親）を返す。期待値は `expect(getFormColumn(container)?.style.maxWidth).toBe('680px')`。
 */
export function getFormColumn(container: HTMLElement): HTMLElement | null {
  const card = container.querySelector('main.sp-page section.sp-card');
  return card ? (card.parentElement as HTMLElement | null) : null;
}
