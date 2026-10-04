// Desk タスク一覧の表示行モデル（dsk-0332）。
//
// 表示順の正本はここ。分類マスタを sortOrder → id で並べ、空分類を除き、未分類バケット（id=null）を
// 末尾へ置いて深さ優先で平坦化し、行 index とサブツリー最大深さを同時に求める。
// TaskTree の描画・D&D projection（移動 / 昇格）・親候補の除外集合がこの1つの導出を共有する。
//
// 注意: 取得ツリー（tree.categories）の並びの権威は backend の orderBy（category.sortOrder 昇順・
// id のタイブレーク無し）で、この関数は分類マスタを (sortOrder, id) で並べる。同一 Space 内で
// sortOrder が重複した時だけ両者はずれ得る（D&D の gapIndex は表示行の連番なので、projection も
// ここで作った行を使う＝判定と描画は常に一致する）。分類マスタ未指定／空の時は tree 側の並びを
// そのまま使う（既定の全件ビュー＝従来の TaskTree と同じ分岐）。
import type { Category } from '@/features/tasks/lib/api';
import type { DeskTaskNode, DeskTaskTree } from './api';
import { indexFlatRows, type FlatRow, type FlatRowIndex } from './drop-projection';

/** 一覧に描く分類グループ（空分類は除く・未分類は末尾）。 */
export interface DeskTreeGroup {
  id: number | null;
  name: string;
  tasks: DeskTaskNode[];
}

/** 表示順のグループと行索引。 */
export interface DeskTreeRows extends FlatRowIndex {
  groups: DeskTreeGroup[];
}

type TreeCategory = DeskTaskTree['categories'][number];

/**
 * ツリーと分類マスタから、表示順のグループ・行・索引を一度に作る（O(n)）。
 * 呼び出し側は tree / categories を依存に memo し、行数ぶん繰り返し呼ばない。
 */
export function buildDeskTreeRows(
  tree: DeskTaskTree | null,
  categories?: Category[],
): DeskTreeRows {
  const treeCategories: TreeCategory[] = tree?.categories ?? [];
  // 分類 lookup は1回だけ作る（分類ごとに tree 側を線形探索しない）。未分類（id=null）は別枠。
  const treeCategoryById = new Map<number, TreeCategory>();
  let unassignedBucket: TreeCategory | null = null;
  for (const category of treeCategories) {
    if (category.id === null) unassignedBucket = category;
    else treeCategoryById.set(category.id, category);
  }

  const groups: DeskTreeGroup[] =
    categories && categories.length > 0
      ? [
          ...[...categories]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
            .map((category) => ({
              id: category.id as number | null,
              name: category.name,
              tasks: treeCategoryById.get(category.id)?.tasks ?? [],
            }))
            // 空分類は描かない（rete-desk-0171）。
            .filter((group) => group.tasks.length > 0),
          // 未分類は権威リストに無いため tree 側から拾い、タスクがある時だけ末尾に描く。
          ...(unassignedBucket && unassignedBucket.tasks.length > 0
            ? [
                {
                  id: null as number | null,
                  name: unassignedBucket.name,
                  tasks: unassignedBucket.tasks,
                },
              ]
            : []),
        ]
      : treeCategories
          .filter((category) => category.tasks.length > 0)
          .map((category) => ({
            id: category.id as number | null,
            name: category.name,
            tasks: category.tasks,
          }));

  const rows: FlatRow[] = [];
  const walk = (node: DeskTaskNode, depth: number) => {
    rows.push({
      id: node.id,
      depth,
      // 行の所属は node 自身の値を使う（projectDrop が扱う所属と同一）。
      categoryId: node.categoryId,
      parentTaskId: node.parentTaskId,
      childCount: node.children.length,
    });
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const group of groups) for (const task of group.tasks) walk(task, 0);

  return { groups, ...indexFlatRows(rows) };
}
