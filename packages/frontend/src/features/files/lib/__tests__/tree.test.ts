import { describe, it, expect } from 'vitest';
import {
  subtree,
  isDescendant,
  reparent,
  hasChildren,
  folderPathSegments,
  folderAncestorIds,
  isHiddenByCollapse,
} from '../tree';
import type { TreeNode } from '../types';

// a(0) > b(1) > c(2), d(1), e(0)
const tree: TreeNode[] = [
  { fid: 'a', level: 0, name: 'A' },
  { fid: 'b', level: 1, name: 'B' },
  { fid: 'c', level: 2, name: 'C' },
  { fid: 'd', level: 1, name: 'D' },
  { fid: 'e', level: 0, name: 'E' },
];

describe('subtree', () => {
  it('ノード + 配下を返す', () => {
    expect(subtree(tree, 0).map((n) => n.fid)).toEqual(['a', 'b', 'c', 'd']);
    expect(subtree(tree, 1).map((n) => n.fid)).toEqual(['b', 'c']);
    expect(subtree(tree, 4).map((n) => n.fid)).toEqual(['e']);
  });
});

describe('isDescendant', () => {
  it('子孫関係を判定', () => {
    expect(isDescendant(tree, 'c', 'a')).toBe(true);
    expect(isDescendant(tree, 'c', 'b')).toBe(true);
    expect(isDescendant(tree, 'd', 'b')).toBe(false);
    expect(isDescendant(tree, 'a', 'e')).toBe(false);
  });
});

describe('hasChildren', () => {
  it('直後がより深い level なら true', () => {
    expect(hasChildren(tree, 0)).toBe(true);
    expect(hasChildren(tree, 2)).toBe(false); // c は葉
    expect(hasChildren(tree, 4)).toBe(false); // e は末尾
  });
});

describe('reparent', () => {
  it('サブツリーを移動先の直下へ移し level を補正', () => {
    // b(+c) を e 配下へ
    const r = reparent(tree, 'b', 'e');
    expect(r.map((n) => `${n.fid}:${n.level}`)).toEqual(['a:0', 'd:1', 'e:0', 'b:1', 'c:2']);
  });
  it('自分の子孫へは移動しない（元参照を返す）', () => {
    expect(reparent(tree, 'a', 'c')).toBe(tree);
  });
  it('同一・存在しない fid は元参照を返す', () => {
    expect(reparent(tree, 'a', 'a')).toBe(tree);
    expect(reparent(tree, 'x', 'a')).toBe(tree);
  });
});

describe('folderPathSegments', () => {
  it('ルート→自身のパスを名前配列で返す（前順リストを level 遡り）', () => {
    expect(folderPathSegments(tree, 'c')).toEqual(['A', 'B', 'C']);
    expect(folderPathSegments(tree, 'b')).toEqual(['A', 'B']);
    expect(folderPathSegments(tree, 'd')).toEqual(['A', 'D']);
  });

  it('ルート直下（level 0）は自身のみ', () => {
    expect(folderPathSegments(tree, 'a')).toEqual(['A']);
    expect(folderPathSegments(tree, 'e')).toEqual(['E']);
  });

  it('存在しない fid は空配列', () => {
    expect(folderPathSegments(tree, 'x')).toEqual([]);
  });
});

describe('folderAncestorIds（fil-0074）', () => {
  // tree: a(0) > b(1) > c(2), a > d(1), e(0)
  it('ルート→親の順で祖先 id を返し、自身は含まない', () => {
    expect(folderAncestorIds(tree, 'c')).toEqual(['a', 'b']);
    expect(folderAncestorIds(tree, 'b')).toEqual(['a']);
    expect(folderAncestorIds(tree, 'd')).toEqual(['a']);
  });

  it('ルート直下は祖先なし（空配列）', () => {
    expect(folderAncestorIds(tree, 'a')).toEqual([]);
    expect(folderAncestorIds(tree, 'e')).toEqual([]);
  });

  it('存在しない fid は空配列', () => {
    expect(folderAncestorIds(tree, 'x')).toEqual([]);
  });
});

describe('isHiddenByCollapse（fil-0072/fil-0073）', () => {
  // tree: a(0) > b(1) > c(2), a > d(1), e(0)
  it('折り畳み無し（空集合）なら全て false', () => {
    expect(isHiddenByCollapse(tree, 0, new Set())).toBe(false);
    expect(isHiddenByCollapse(tree, 2, new Set())).toBe(false);
    expect(isHiddenByCollapse(tree, 4, new Set())).toBe(false);
  });

  it('親が折り畳まれていれば子孫が隠れる（a を畳む → b,c,d が隠れる）', () => {
    const collapsed = new Set(['a']);
    expect(isHiddenByCollapse(tree, 1, collapsed)).toBe(true); // b
    expect(isHiddenByCollapse(tree, 2, collapsed)).toBe(true); // c
    expect(isHiddenByCollapse(tree, 3, collapsed)).toBe(true); // d
  });

  it('折り畳まれていない兄弟は影響を受けない（a を畳んでも e は見える）', () => {
    const collapsed = new Set(['a']);
    expect(isHiddenByCollapse(tree, 4, collapsed)).toBe(false); // e
  });

  it('孫を直接畳んだ場合は親は隠れず子孫のみ隠れる', () => {
    const collapsed = new Set(['b']);
    expect(isHiddenByCollapse(tree, 0, collapsed)).toBe(false); // a は見える
    expect(isHiddenByCollapse(tree, 1, collapsed)).toBe(false); // b は自分
    expect(isHiddenByCollapse(tree, 2, collapsed)).toBe(true); // c は隠れる
  });

  it('存在しない fid が collapsedIds に含まれていても無視される（fil-0073 criteria）', () => {
    const collapsed = new Set(['does-not-exist']);
    expect(isHiddenByCollapse(tree, 1, collapsed)).toBe(false);
    expect(isHiddenByCollapse(tree, 4, collapsed)).toBe(false);
  });

  it('祖先が複数階層折り畳まれていても正しく検出する', () => {
    const collapsed = new Set(['a', 'b']);
    expect(isHiddenByCollapse(tree, 2, collapsed)).toBe(true); // c は a と b 両方に隠される
  });

  it('index 0 のルート直下は折り畳み判定の影響を受けない', () => {
    const collapsed = new Set(['a']);
    expect(isHiddenByCollapse(tree, 0, collapsed)).toBe(false); // 自分は隠れる対象ではない
  });
});
