/**
 * reorder の集合検証の共通化（cmn-0151）。
 *
 * 並び替え処理に渡された id 一覧が「いま存在するものと過不足なく一致するか」を判定する。
 * 確認の強さが場所ごとに食い違っていたのを、この 1 関数へ統一する:
 * - 過不足なし（一致）→ true
 * - 過剰 / 欠落 / すり替え / 重複（集合は一致するが長さが違う）→ false
 *
 * 重複は Set 化で潰れるため size 比較だけでは集合一致と誤判定する（同一行へ 2 度 write する穴）。
 * そのため requestedIds の長さも必ず突き合わせる。
 *
 * @param currentIds 現存する id（DB から読んだ値）
 * @param orderedIds リクエストで渡された並び替え後の id 一覧
 */
export function validateReorderSet<T>(currentIds: readonly T[], orderedIds: readonly T[]): boolean {
  const currentSet = new Set(currentIds);
  const requestedSet = new Set(orderedIds);
  return (
    requestedSet.size === orderedIds.length &&
    currentSet.size === requestedSet.size &&
    [...currentSet].every((id) => requestedSet.has(id))
  );
}
