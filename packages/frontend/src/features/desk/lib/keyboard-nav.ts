/**
 * Desk キーボードナビの純粋ヘルパー。
 *
 * モック `desk/index.html` のキーボード移動ロジックを純粋関数として切り出したもの。
 * DOM 参照を持たず index / 座標のみで完結するため単体テスト可能。
 * - stepIndex: ↑↓ および Tab/Shift+Tab の edge-stop（wrap しない）index 計算
 * - nearestIndexByCenter: ←→ 移動時、反対ペインで縦中心が最も近い行を選ぶ
 */

/**
 * 現在 index から delta 方向へ 1 つ進めた index を返す。
 * 範囲外（先頭で上 / 末尾で下）や current が無効（-1）なら null（edge-stop, no wrap）。
 */
export function stepIndex(length: number, currentIndex: number, delta: number): number | null {
  if (currentIndex < 0) return null;
  const next = currentIndex + delta;
  if (next < 0 || next >= length) return null;
  return next;
}

/**
 * source の縦中心に最も近い候補中心の index を返す。同点は先に出現した方（index 小）。
 * 候補が空なら null。
 */
export function nearestIndexByCenter(
  sourceCenterY: number,
  centers: readonly number[],
): number | null {
  if (centers.length === 0) return null;
  let best = 0;
  let bestDist = Math.abs(centers[0] - sourceCenterY);
  for (let i = 1; i < centers.length; i++) {
    const dist = Math.abs(centers[i] - sourceCenterY);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}
