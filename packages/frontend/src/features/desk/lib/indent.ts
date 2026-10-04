/**
 * 段落インデント（rete-desk-0063 / A案）の純粋ヘルパー。
 *
 * 保存形式は HTML（ADR 0019）。インデントは `style` 直書き（margin-left）を避け、
 * **既存 sanitize 許可リストに含まれる `class`**（`desk-indent-N`）で表現する。これにより
 * `@rete/shared` の許可属性を広げず（XSS posture 不変）、frontend DOMPurify / backend
 * sanitize-html の双方をそのまま通過する。レベルは 0〜MAX に clamp する。
 */
export const MAX_INDENT = 5;

/** インデント対象ノード（段落・見出し）。リスト項目は sink/liftListItem で別管理。 */
export const INDENT_NODE_TYPES = ['paragraph', 'heading'] as const;

/**
 * リスト系ノード。混在選択でこれらに入ったら子孫を辿らない（リスト内段落の二重インデント防止）。
 * リスト項目のインデントは sink/liftListItem が担当するため、段落 indent コマンドの対象外。
 */
export const LIST_NODE_TYPES: readonly string[] = ['bulletList', 'orderedList', 'listItem'];

/** レベルを 0〜MAX_INDENT に正規化する（非数値・負値・超過を吸収）。 */
export function clampIndent(level: unknown): number {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_INDENT);
}

/** class 文字列から現在のインデントレベルを読み取る（`desk-indent-N`）。無ければ 0。 */
export function levelFromClass(className: string | null | undefined): number {
  const m = /(?:^|\s)desk-indent-(\d)(?:\s|$)/.exec(className ?? '');
  return m ? clampIndent(m[1]) : 0;
}

/** レベルから renderHTML 用の属性を返す。0 は class を付けない（クリーンな HTML を保つ）。 */
export function indentRenderAttrs(level: unknown): { class?: string } {
  const n = clampIndent(level);
  return n > 0 ? { class: `desk-indent-${n}` } : {};
}
