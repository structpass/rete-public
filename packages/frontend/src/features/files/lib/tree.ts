import type { TreeNode } from './types';

/**
 * フラットツリー（level でインデント表現）に対する操作群。モック subtreeOf / isDescendant /
 * reparentTree を移植し、DOM 直接操作ではなく新しい配列を返す純関数にした（テスト容易・React 適合）。
 */

/** index のノード + その配下（直後の、より深い level のノード群）をサブツリーとして返す。 */
export function subtree(tree: TreeNode[], index: number): TreeNode[] {
  const lvl = tree[index].level;
  const block: TreeNode[] = [tree[index]];
  for (let j = index + 1; j < tree.length; j++) {
    if (tree[j].level > lvl) block.push(tree[j]);
    else break;
  }
  return block;
}

/** nodeFid が ancestorFid のサブツリーに含まれるか（自己ドロップ防止に使う）。 */
export function isDescendant(tree: TreeNode[], nodeFid: string, ancestorFid: string): boolean {
  const ai = tree.findIndex((n) => n.fid === ancestorFid);
  if (ai < 0) return false;
  return subtree(tree, ai).some((n) => n.fid === nodeFid);
}

/**
 * nodeFid のサブツリーを targetFid の配下（直下の先頭）へ移動した新ツリーを返す。
 * 移動不能（同一・存在しない・自分の子孫へのドロップ）は元の参照をそのまま返す。
 */
export function reparent(tree: TreeNode[], nodeFid: string, targetFid: string): TreeNode[] {
  if (nodeFid === targetFid) return tree;
  const ni = tree.findIndex((n) => n.fid === nodeFid);
  const ti = tree.findIndex((n) => n.fid === targetFid);
  if (ni < 0 || ti < 0) return tree;
  if (isDescendant(tree, targetFid, nodeFid)) return tree; // 自分の子孫へは移動不可

  const block = subtree(tree, ni);
  const blockFids = new Set(block.map((n) => n.fid));
  const delta = tree[ti].level + 1 - tree[ni].level;
  const moved = block.map((n) => ({ ...n, level: n.level + delta }));

  const rest = tree.filter((n) => !blockFids.has(n.fid));
  const restTi = rest.findIndex((n) => n.fid === targetFid);
  return [...rest.slice(0, restTi + 1), ...moved, ...rest.slice(restTi + 1)];
}

/** index のノードが子を持つか（直後により深い level のノードがあるか）。シェブロン表示用。 */
export function hasChildren(tree: TreeNode[], index: number): boolean {
  return index + 1 < tree.length && tree[index + 1].level > tree[index].level;
}

/**
 * index のノードが折り畳まれた祖先のサブツリー内にいるか（fil-0072・ツリー折り畳み描画フィルタ）。
 * 祖先方向へ遡り、自身より浅い level のうち collapsedIds に含まれる fid があれば true。
 * 存在しない fid は collapsedIds に含まれていても祖先を遡る経路に登場しないため自然に無視される
 * （fil-0073 criteria: 保存済み id に現在存在しないフォルダが含まれていても正常動作）。
 */
export function isHiddenByCollapse(
  tree: TreeNode[],
  index: number,
  collapsedIds: ReadonlySet<string>,
): boolean {
  if (collapsedIds.size === 0) return false;
  let needLevel = tree[index].level - 1;
  for (let i = index - 1; i >= 0 && needLevel >= 0; i--) {
    if (tree[i].level === needLevel) {
      if (collapsedIds.has(tree[i].fid)) return true;
      needLevel--;
    }
  }
  return false;
}

/**
 * fid のフォルダの「ルート→自身」のパスを名前配列で返す（rete-files-0032・タグ横断検索の場所列）。
 * フラット前順リスト上で、自身の level から 1 つずつ遡りながら直近の祖先名を集める
 * （前順なので、ある level のノードの親はそれより前にある最も近い level-1 のノード）。存在しない fid は空配列。
 */
export function folderPathSegments(tree: TreeNode[], fid: string): string[] {
  const idx = tree.findIndex((n) => n.fid === fid);
  if (idx < 0) return [];
  const segs: string[] = [];
  let need = tree[idx].level;
  for (let i = idx; i >= 0 && need >= 0; i--) {
    if (tree[i].level === need) {
      segs.unshift(tree[i].name);
      need--;
    }
  }
  return segs;
}

/**
 * fid の祖先フォルダ id をルート→親の順で返す（自身は含まない・fil-0074）。
 * 検索結果から開くとき祖先の折り畳みを解く対象。存在しない fid / ルート直下は空配列。
 */
export function folderAncestorIds(tree: TreeNode[], fid: string): string[] {
  const idx = tree.findIndex((n) => n.fid === fid);
  if (idx < 0) return [];
  const ids: string[] = [];
  let need = tree[idx].level - 1;
  for (let i = idx - 1; i >= 0 && need >= 0; i--) {
    if (tree[i].level === need) {
      ids.unshift(tree[i].fid);
      need--;
    }
  }
  return ids;
}
