/**
 * タスクツリーの Response DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/task` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（tasks.mapper.ts / frontend desk の import パスは変えない）。
 *
 * ノードは TaskResponseDto に子配列を加えた再帰構造で、children は parentTaskId 解決で組み立てた
 * 直接の子ノード（兄弟順は取得時の昇順を保持）。カテゴリ単位のグループ分けは desk タスク明細の
 * グループ見出しに対応する。
 */

export type { TaskTreeNodeDto, TaskTreeCategoryDto, TaskTreeResponseDto } from '@rete/shared';
