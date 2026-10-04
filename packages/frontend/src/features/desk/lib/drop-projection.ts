// ドロップ先 projection（昇格 / 移動 共通の純ロジック）。
//
// dnd-kit 公式 sortable tree example の getProjection を移植・改変。
// Source: https://github.com/clauderic/dnd-kit (MIT License, Copyright (c) 2021 Claudéric Demers)
// minDepth/maxDepth + ポインタ横オフセット量子化 → クランプの骨子を踏襲し、本 PJ 向けに
//   ①4 階層クランプ（採用 depth + サブツリー自身の深さ <= 上限）
//   ②自己子孫ドロップ禁止（ドラッグ中サブツリー範囲を projection 対象外）
// の 2 点を足している。
import type { DeskTaskTree, DeskTaskNode } from './api';

/** 0-indexed のツリー最大深さ（= 4 階層）。採用 depth + subtreeDepth がこれを超える子化は不可。 */
export const MAX_TREE_DEPTH = 3;

/** 1 インデントの px 幅（CSS の is-indent-* 段差と整合させる量子化単位）。昇格・移動で共有。 */
export const INDENT_WIDTH = 24;

/** タスク行 draggable が data.current に載せる識別情報（移動 D&D）。 */
export interface TaskMoveData {
  kind: 'task-move';
  taskId: number;
  /** サブツリー自身の最大深さ（4 階層クランプに使う）。 */
  subtreeDepth: number;
}

/** gap droppable が data.current に載せる識別情報（task-tree が全行間に敷く）。昇格・移動で共有。 */
export interface TaskGapData {
  kind: 'task-gap';
  gapIndex: number;
  /**
   * dsk-0256: 分類境界 gap（直前カテゴリの appendGapIndex と gapIndex が衝突する、次カテゴリ先頭行の
   * GapDropZone）にだけ載る、prepend 先カテゴリ ID（null=未分類バケット）。未指定＝境界 gap ではない
   * 通常の gap。projectDrop がこれを見て「次カテゴリの先頭へ prepend」を明示的に解決する。
   */
  boundaryPrependCategoryId?: number | null;
}

/** 平坦化したツリー 1 行。projection はこの配列＋ gap 位置＋横位置で判定する。 */
export interface FlatRow {
  id: number;
  depth: number;
  // 所属分類 ID。null = 未分類バケット（rete-desk-0158）。
  categoryId: number | null;
  parentTaskId: number | null;
  /** 直接の子の数（行表示の付帯情報。projection 自体は depth で判定）。 */
  childCount: number;
}

/** 確定したドロップ先（backend move/promote payload の parent/after/category を一意に表す）。 */
export interface ResolvedDropTarget {
  parentTaskId: number | null;
  afterTaskId: number | null;
  // 移動先分類 ID。null = 未分類バケット（rete-desk-0158）。
  categoryId: number | null;
}

/** projection 結果。depth = 採用インデント（緑枠位置）、target = 確定ドロップ先。 */
export interface DropProjection {
  depth: number;
  target: ResolvedDropTarget;
}

/** ツリーを深さ優先で平坦化（表示順）。各行に depth / categoryId / parentTaskId を付与する。 */
export function flattenTree(tree: DeskTaskTree | null): FlatRow[] {
  const rows: FlatRow[] = [];
  if (!tree) return rows;
  const walk = (node: DeskTaskNode, depth: number) => {
    rows.push({
      id: node.id,
      depth,
      categoryId: node.categoryId,
      parentTaskId: node.parentTaskId,
      childCount: node.children.length,
    });
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const category of tree.categories) {
    for (const task of category.tasks) walk(task, 0);
  }
  return rows;
}

/**
 * ツリーから指定 id のノード（= 一覧が保持する完全な Task 要約 / DeskTaskNode extends Task）を
 * 深さ優先で探す。dsk-0219: タスク詳細オープン時の種（初期 task）として使い、詳細 GET 完了まで
 * スピナーのちらつきを起こさずに即描画するため。見つからなければ null。
 */
export function findTaskNode(tree: DeskTaskTree | null, id: number): DeskTaskNode | null {
  if (!tree) return null;
  const walk = (node: DeskTaskNode): DeskTaskNode | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  for (const category of tree.categories) {
    for (const task of category.tasks) {
      const hit = walk(task);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * 平坦化した行の索引。全行分の先頭探索（findIndex）とサブツリー深さの再走査を1回の集計へ置き換える。
 * dsk-0332: 行数ぶん subtreeDepthOf を呼ぶと比較回数が行数の二乗で増えるため、ツリー更新時に1回だけ
 * 作って各行・各ドラッグイベントからは参照で読む（呼び出し側で memo する）。
 */
export interface FlatRowIndex {
  /** 索引の対象行（flattenTree / buildDeskTreeRows の表示順）。 */
  rows: FlatRow[];
  /** id -> rows の index（先頭探索の代替。重複 id は先頭の行を採る＝findIndex と同値）。 */
  indexOfId: Map<number, number>;
  /** id -> サブツリー自身の最大深さ（葉=0）。 */
  subtreeDepthOfId: Map<number, number>;
}

/**
 * 行配列から索引を作る（O(n) 1回）。サブツリーの最大深さは「その行の直後に続く、その行より深い行の
 * 最大絶対深さ - 自身の深さ」なので、末尾から未確定の祖先をスタックへ積みながら1回走査すれば全行分が
 * まとめて求まる。
 */
export function indexFlatRows(rows: FlatRow[]): FlatRowIndex {
  const maxDepthByIndex = new Array<number>(rows.length);
  const open: number[] = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const depth = rows[i].depth;
    // 深さが自身以下の行が来たら、スタック上のそれより深い行はすべて自身のサブツリーの内側。
    let maxDepth = depth;
    while (open.length > 0 && rows[open[open.length - 1]].depth > depth) {
      maxDepth = Math.max(maxDepth, maxDepthByIndex[open.pop() as number]);
    }
    maxDepthByIndex[i] = maxDepth;
    open.push(i);
  }
  const indexOfId = new Map<number, number>();
  const subtreeDepthOfId = new Map<number, number>();
  rows.forEach((row, i) => {
    if (indexOfId.has(row.id)) return; // 先頭の行を採用（従来の findIndex と同じ）
    indexOfId.set(row.id, i);
    subtreeDepthOfId.set(row.id, maxDepthByIndex[i] - row.depth);
  });
  return { rows, indexOfId, subtreeDepthOfId };
}

/**
 * 指定タスクのサブツリー自身の最大深さ（葉=0）。索引を渡すと再集計しない
 * （全行分を求める用途では indexFlatRows の結果を共有する）。不在 id は 0。
 */
export function subtreeDepthOf(rows: FlatRow[], rootId: number, index?: FlatRowIndex): number {
  const resolved = index ?? indexFlatRows(rows);
  return resolved.subtreeDepthOfId.get(rootId) ?? 0;
}

/** rootId とその全子孫の id 集合（自己子孫ドロップ禁止の除外セット）。索引を渡すと先頭探索を省く。 */
export function subtreeIds(rows: FlatRow[], rootId: number, index?: FlatRowIndex): Set<number> {
  const ids = new Set<number>();
  const idx = (index ?? indexFlatRows(rows)).indexOfId.get(rootId);
  if (idx === undefined) return ids;
  const rootDepth = rows[idx].depth;
  ids.add(rootId);
  for (let i = idx + 1; i < rows.length; i += 1) {
    if (rows[i].depth <= rootDepth) break;
    ids.add(rows[i].id);
  }
  return ids;
}

/** applyMove の引数。taskId = 移動サブツリーのルート、target = 確定ドロップ先。 */
export interface ApplyMoveArgs {
  taskId: number;
  target: ResolvedDropTarget;
}

/** node とその全子孫の categoryId を一括上書き（イミュータブル）。null = 未分類（rete-desk-0158）。 */
function withCategoryDeep(node: DeskTaskNode, categoryId: number | null): DeskTaskNode {
  return {
    ...node,
    categoryId,
    children: node.children.map((c) => withCategoryDeep(c, categoryId)),
  };
}

/** ツリーから taskId のサブツリーを抜き出し（detach）、残ツリーと抜いたノードを返す。 */
function detachNode(
  nodes: DeskTaskNode[],
  taskId: number,
): { rest: DeskTaskNode[]; removed: DeskTaskNode | null } {
  let removed: DeskTaskNode | null = null;
  const rest: DeskTaskNode[] = [];
  for (const n of nodes) {
    if (n.id === taskId) {
      removed = n;
      continue;
    }
    const child = detachNode(n.children, taskId);
    if (child.removed) removed = child.removed;
    rest.push(child.removed ? { ...n, children: child.rest } : n);
  }
  return { rest, removed };
}

/** sibling 配列の afterTaskId 直後（null=先頭）に node を差し込む。 */
function insertAfter(
  siblings: DeskTaskNode[],
  node: DeskTaskNode,
  afterTaskId: number | null,
): DeskTaskNode[] {
  if (afterTaskId == null) return [node, ...siblings];
  const out: DeskTaskNode[] = [];
  for (const s of siblings) {
    out.push(s);
    if (s.id === afterTaskId) out.push(node);
  }
  // afterTaskId が見つからなければ末尾に付ける（防御的）。
  if (!out.includes(node)) out.push(node);
  return out;
}

/** parentTaskId 配下の sibling 群へ node を差し込む（再帰。トップレベルは parentTaskId=null）。 */
function insertUnderParent(
  nodes: DeskTaskNode[],
  node: DeskTaskNode,
  parentTaskId: number | null,
  afterTaskId: number | null,
): DeskTaskNode[] {
  if (parentTaskId == null) return insertAfter(nodes, node, afterTaskId);
  return nodes.map((n) =>
    n.id === parentTaskId
      ? { ...n, children: insertAfter(n.children, node, afterTaskId) }
      : { ...n, children: insertUnderParent(n.children, node, parentTaskId, afterTaskId) },
  );
}

/**
 * サブツリーを target（parent/after/category）へ移動した新ツリーを返す（純関数・楽観更新用）。
 * categoryId はサブツリー全体に波及。対象不在なら元ツリー相当を返す。backend 確定後は refetch で上書き。
 */
export function applyMove(tree: DeskTaskTree, { taskId, target }: ApplyMoveArgs): DeskTaskTree {
  // 1) 全カテゴリから対象サブツリーを detach。
  let removed: DeskTaskNode | null = null;
  const detached = tree.categories.map((cat) => {
    const r = detachNode(cat.tasks, taskId);
    if (r.removed) removed = r.removed;
    return { ...cat, tasks: r.rest };
  });
  if (!removed) return tree;

  // 2) categoryId を波及させたサブツリーに付け替え、parentTaskId を新親へ。
  const moved: DeskTaskNode = {
    ...withCategoryDeep(removed, target.categoryId),
    parentTaskId: target.parentTaskId,
  };

  // 3) 移動先カテゴリの該当 parent 配下へ差し込む。
  const next = detached.map((cat) =>
    cat.id === target.categoryId
      ? {
          ...cat,
          tasks: insertUnderParent(cat.tasks, moved, target.parentTaskId, target.afterTaskId),
        }
      : cat,
  );
  return { categories: next };
}

interface ProjectDropArgs {
  rows: FlatRow[];
  /** 落とす gap の位置。gapIndex = i は「行 i-1 と行 i の間」（0=先頭, rows.length=末尾）。 */
  gapIndex: number;
  /** ポインタ横オフセット（px。基準 0 = prev と同じ深さ）。 */
  offsetX: number;
  /** 1 インデントの px 幅。offsetX をこの幅で量子化する。 */
  indentWidth: number;
  /** ドラッグ中サブツリー自身の最大深さ（昇格=0 / 移動=サブツリー深さ）。4 階層クランプに使う。 */
  subtreeDepth: number;
  /** 自己子孫拒否のための除外 id（ドラッグ中サブツリー）。指定時、内部 gap は null を返す。 */
  excludeIds?: Set<number>;
  /**
   * 量子化の基準 depth（offsetX=0 の時の depth）。移動はドラッグ中タスクの元 depth、
   * 昇格は未指定（→ prev.depth を基準）。dnd-kit 公式 example の activeItem.depth に相当。
   */
  baseDepth?: number;
  /** dsk-0256: gap データの同名フィールドをそのまま透過（TaskGapData 参照）。 */
  boundaryPrependCategoryId?: number | null;
  /**
   * rows の索引（indexFlatRows の結果）。渡すと id -> index の先頭探索を行わない。
   * ドラッグイベントごとに呼ぶ経路では、ツリー更新時に作った索引をそのまま渡す。
   */
  index?: FlatRowIndex;
}

/** 除外行を飛ばして gap 直前の「実在 prev 行」を返す。範囲外 index は末尾にクランプ。 */
function prevVisibleBefore(
  rows: FlatRow[],
  gapIndex: number,
  exclude: Set<number>,
): FlatRow | null {
  for (let i = Math.min(gapIndex, rows.length) - 1; i >= 0; i -= 1) {
    if (!exclude.has(rows[i].id)) return rows[i];
  }
  return null;
}

/** 除外行を飛ばして gap 直後の「実在 next 行」を返す。 */
function nextVisibleAt(rows: FlatRow[], gapIndex: number, exclude: Set<number>): FlatRow | null {
  for (let i = gapIndex; i < rows.length; i += 1) {
    if (!exclude.has(rows[i].id)) return rows[i];
  }
  return null;
}

/**
 * gap + 横位置 → 採用 depth + 確定 DropTarget を返す。落とせない gap / depth は null。
 *
 * - maxDepth = prev ? prev.depth + 1 : 0（prev の最初の子まで深くできる。prev 無し先頭は 0）
 * - minDepth = next ? next.depth : 0（次行がある間はその深さ以上にしか戻れない。末尾は 0 まで）
 * - 4 階層クランプ: 採用 depth は (MAX_TREE_DEPTH - subtreeDepth) を超えない。これが minDepth を
 *   下回るなら、このサブツリーはこの gap に入らない（null）。
 * - 自己子孫拒否: excludeIds が gap の prev/next を全て覆う（=サブツリー内部の gap）なら null。
 */
export function projectDrop({
  rows,
  gapIndex,
  offsetX,
  indentWidth,
  subtreeDepth,
  excludeIds,
  baseDepth,
  boundaryPrependCategoryId,
  index,
}: ProjectDropArgs): DropProjection | null {
  const exclude = excludeIds ?? new Set<number>();

  // gap の両隣が両方とも除外対象（=サブツリー内部の隙間）なら落とせない。
  const rawPrev = gapIndex > 0 ? rows[gapIndex - 1] : null;
  const rawNext = gapIndex < rows.length ? rows[gapIndex] : null;
  if (rawPrev && rawNext && exclude.has(rawPrev.id) && exclude.has(rawNext.id)) {
    return null;
  }

  const prev = prevVisibleBefore(rows, gapIndex, exclude);
  const next = nextVisibleAt(rows, gapIndex, exclude);

  const maxDepth = prev ? prev.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;

  // 4 階層クランプ: サブツリー自身の深さを足して上限を超えない範囲に max を絞る。
  const depthCap = MAX_TREE_DEPTH - subtreeDepth;
  const effectiveMax = Math.min(maxDepth, depthCap);
  if (effectiveMax < minDepth) return null; // この gap には収まらない

  // ポインタ横オフセットを 1 インデント幅で量子化し、基準 depth から採用 depth を決める。
  // 基準 = baseDepth（移動: ドラッグ元 depth）。未指定（昇格）は prev.depth を基準にする。
  const base = baseDepth ?? (prev ? prev.depth : 0);
  const proposed = base + Math.round(offsetX / indentWidth);
  const depth = Math.max(minDepth, Math.min(effectiveMax, proposed));

  // dsk-0256: 分類境界 gap（次カテゴリ先頭行）で、量子化 depth が minDepth（= その行自身の depth。
  // 境界は常にトップレベルなので実質 0）のままなら、resolveTarget の祖先歩き（prev 基準）に委ねず
  // 明示的に「次カテゴリの先頭へ prepend」を確定する。depth > minDepth（右へオフセットして prev の
  // 子にする意図）は通常どおり resolveTarget に委ねる。
  const target =
    boundaryPrependCategoryId !== undefined && depth === minDepth
      ? { parentTaskId: null, afterTaskId: null, categoryId: boundaryPrependCategoryId }
      : resolveTarget(rows, prev, depth, exclude, index?.indexOfId);
  // 先頭 gap で実在行が 1 つも無い（ドラッグ中サブツリーがツリー全体）場合、移動先が確定できない。
  // 「自分しかいない＝移動先なし」が正しい挙動なので落とせない（null）とする（指摘[8]）。
  if (target == null) return null;
  return { depth, target };
}

/**
 * prev 行 + 採用 depth → parentTaskId / afterTaskId / categoryId を確定する。
 * - depth === prev.depth + 1: prev の最初の子（after=null, parent=prev）
 * - depth === prev.depth    : prev の兄弟（after=prev, parent=prev.parent）
 * - depth <  prev.depth     : prev の祖先のうち当該 depth の行の兄弟（after=その祖先, parent=その祖先の親）
 * prev が無い（先頭）: トップレベル先頭（parent=null, after=null）。categoryId は次の実在行から導く。
 * 実在行が 1 つも無い（全行 exclude）なら移動先カテゴリを決められないため null（落とせない）。
 */
function resolveTarget(
  rows: FlatRow[],
  prev: FlatRow | null,
  depth: number,
  exclude: Set<number>,
  indexOfId?: Map<number, number>,
): ResolvedDropTarget | null {
  if (!prev) {
    // 先頭 gap。次の実在行のカテゴリへトップレベル先頭として入る。
    const firstReal = rows.find((r) => !exclude.has(r.id));
    // 実在行が無い＝ドラッグ中サブツリーがツリー全体。カテゴリを推定で埋めず落とせない（指摘[8]）。
    if (!firstReal) return null;
    return { parentTaskId: null, afterTaskId: null, categoryId: firstReal.categoryId };
  }

  if (depth > prev.depth) {
    // prev の最初の子。
    return { parentTaskId: prev.id, afterTaskId: null, categoryId: prev.categoryId };
  }

  // depth <= prev.depth: prev から祖先方向へ辿り、当該 depth の行（= 新兄弟の直前兄弟）を探す。
  // prev の index は索引があれば参照で引き、無ければ先頭から探す（呼び出し側の互換のため）。
  const prevIdx = indexOfId?.get(prev.id) ?? rows.findIndex((r) => r.id === prev.id);
  let anchor: FlatRow = prev;
  for (let i = prevIdx; i >= 0; i -= 1) {
    const r = rows[i];
    if (r.depth === depth) {
      anchor = r;
      break;
    }
  }
  return {
    parentTaskId: anchor.parentTaskId,
    afterTaskId: anchor.id,
    categoryId: anchor.categoryId,
  };
}
