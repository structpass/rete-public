// Desk サイドバーのアバター表示ヘルパ（§3 コピペ回避・サイドバー / DM ピッカーで共有）。
// mock の avatar-group-* クラスを index で循環利用し、新規 CSS を増やさず色味の豊かさを保つ。

const AVATAR_COLORS = ['avatar-group-a', 'avatar-group-b', 'avatar-group-c', 'avatar-group-d'];

/** index に応じた avatar 色クラス（avatar-group + 循環色）。 */
export function avatarClassFor(index: number): string {
  return `avatar-group ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`;
}

/** 表示名からアバター文字（先頭 1 文字・絵文字/サロゲート安全）を導く。 */
export function avatarChar(name: string): string {
  return [...name][0] ?? '?';
}
