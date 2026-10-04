/** フリップ/クランプ算出に必要な anchor 矩形の最小面（DOMRect 互換）。 */
export interface FlipAnchorRect {
  left: number;
  top: number;
  bottom: number;
}

export interface FlipPositionOptions {
  /** true=上優先（上に収まらなければ下へフリップ）/ false=下優先の対称挙動。 */
  preferAbove: boolean;
  /** ビューポート端からの最小マージン（px）。 */
  margin: number;
  /** anchor とポップオーバーの間隔（px）。 */
  gap: number;
}

/**
 * ポップオーバーのビューポート内フリップ/クランプ座標算出（dsk-0369）。
 * reaction-bar（絵文字ピッカー）と mention-suggestion（メンション候補）が各ローカルに持っていた
 * 逐語同型の算法を純関数へ集約する。返すのは fixed 配置の {left, top} のみで、寸法の取得元・
 * 結果の適用先（React state / anchor.style 直書き）・優先方向や余白の定数は呼び出し側が持つ。
 *
 * - 横: anchor 左基準。右端を越えるなら内側へ寄せ、最低 margin を確保（左端クランプ）。
 * - 縦: 優先側に収まればそちら、収まらなければ反対側へフリップ、どちらも無理なら下端寄せへクランプ。
 *
 * viewport を引数化してあるのは unit テストで window をモックせずに境界を検証するため
 * （省略時は window.innerWidth/innerHeight）。
 */
export function computeFlipPosition(
  anchorRect: FlipAnchorRect,
  size: { width: number; height: number },
  { preferAbove, margin, gap }: FlipPositionOptions,
  viewport?: { width: number; height: number },
): { left: number; top: number } {
  const vw = viewport?.width ?? window.innerWidth;
  const vh = viewport?.height ?? window.innerHeight;
  const pw = size.width;
  const ph = size.height;

  let left = anchorRect.left;
  if (left + pw > vw - margin) left = vw - margin - pw;
  if (left < margin) left = margin;

  const above = anchorRect.top - gap - ph;
  const below = anchorRect.bottom + gap;
  const clamp = () => Math.max(margin, vh - margin - ph);
  let top: number;
  if (preferAbove) {
    // 上優先: 上に入れば上、入らなければ下、下も無理なら下端寄せ。
    top = above >= margin ? above : below + ph <= vh - margin ? below : clamp();
  } else {
    // 下優先: 下に入れば下、入らなければ上、上も無理なら下端寄せ。
    top = below + ph <= vh - margin ? below : above >= margin ? above : clamp();
  }
  return { left, top };
}
