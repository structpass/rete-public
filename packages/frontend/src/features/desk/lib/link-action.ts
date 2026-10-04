/**
 * リンク挿入（rete-desk-0064）の判定ロジック（純粋関数）。
 *
 * 仕様（開発統括確定 2026-06-08）:
 * - 説明欄で文字列を選択 → ボタン押下時、その文字列を「表示」へ自動セットする（呼び出し側）。
 * - 「表示」が選択文字列のまま（or 空）なら、選択範囲にそのまま URL リンクを設定する（従来挙動）。
 * - 「表示」を手入力した場合（選択なし、または表示を変更）なら、その文字列（リンク付き）を本文へ挿入する。
 *
 * URL の危険スキーム遮断は呼び出し側（RICH_TEXT_UNSAFE_URI_RE）で行い、本関数は到達した
 * URL を有効候補として扱う。空 URL はリンク解除（選択あり）／no-op（選択なし）。
 */
export type LinkAction =
  | { kind: 'noop' }
  | { kind: 'unset' }
  | { kind: 'setOnSelection'; href: string }
  | { kind: 'insert'; href: string; text: string };

export interface LinkActionInput {
  /** ボタン押下時点で本文に非空選択があったか。 */
  hadSelection: boolean;
  /** 押下時点の選択文字列（hadSelection=false なら ''）。 */
  selectedText: string;
  /** 「表示」入力欄の現在値。 */
  displayText: string;
  /** 「URL」入力欄の現在値。 */
  url: string;
}

export function decideLinkAction(input: LinkActionInput): LinkAction {
  const url = input.url.trim();
  const display = input.displayText;

  if (url === '') {
    // URL 空 = 解除意図。選択があれば解除、無ければ何もしない。
    return input.hadSelection ? { kind: 'unset' } : { kind: 'noop' };
  }

  const displayUnchanged = display.trim() === '' || display === input.selectedText;
  if (input.hadSelection && displayUnchanged) {
    // 選択文字列にそのままリンク設定（従来挙動）。
    return { kind: 'setOnSelection', href: url };
  }

  // 表示テキストを挿入（選択ありで表示変更時は置換、選択なしは挿入）。表示空なら URL を表示に使う。
  const text = display.trim() === '' ? url : display;
  return { kind: 'insert', href: url, text };
}
