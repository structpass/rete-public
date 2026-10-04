'use client';

import { useState, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { DragStartEvent, DragMoveEvent, DragEndEvent } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import { moveTask, type DeskTaskTree } from '../lib/api';
import {
  projectDrop,
  subtreeDepthOf,
  subtreeIds,
  applyMove,
  INDENT_WIDTH,
  type FlatRowIndex,
  type DropProjection,
  type ResolvedDropTarget,
  type ApplyMoveArgs,
  type TaskMoveData,
  type TaskGapData,
} from '../lib/drop-projection';

interface UseTaskMoveArgs {
  /**
   * 表示行の索引（buildDeskTreeRows の結果を memo したもの）。dsk-0332: ドラッグイベントごとに
   * flattenTree で作り直さず、ツリー更新時に作った派生値をそのまま使う。
   */
  rows: FlatRowIndex;
  setTree: Dispatch<SetStateAction<DeskTaskTree | null>>;
  refetchTree: () => Promise<void>;
}

/** task-tree が緑枠を描くための現在のドロップ projection（gap 位置 + 採用 depth）。 */
export interface MoveIndicator {
  gapIndex: number;
  depth: number;
  /** dsk-0256: DropIndicator（use-chat-promotion）同名フィールド参照。境界 gap ホバー時の排他フラグ。 */
  boundaryPrependCategoryId?: number | null;
}

export interface UseTaskMoveResult {
  /** ドラッグ中タスク id（DragOverlay と元行のゴースト表示に使う）。null=非ドラッグ。 */
  activeTaskId: number | null;
  /** 現在ホバー中の有効ドロップ位置（緑枠）。null=落とせない / 非ホバー。 */
  indicator: MoveIndicator | null;
  onDragStart: (e: DragStartEvent) => void;
  onDragMove: (e: DragMoveEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  /** projection 確定済みのドロップを楽観更新 + API + ロールバックで適用（単体テスト用に分離）。 */
  commitMove: (args: ApplyMoveArgs) => Promise<void>;
}

/** drag イベントから task-move data を読む（昇格テーマの drag は無視）。 */
function readMoveData(e: DragStartEvent | DragEndEvent | DragMoveEvent): TaskMoveData | null {
  const data = e.active.data.current as TaskMoveData | undefined;
  return data?.kind === 'task-move' ? data : null;
}

/**
 * タスク行 D&D 移動の状態機械（spec §5.1 移動固有）。
 * 昇格（useChatPromotion）と projection ロジックを共有（lib/drop-projection）し、
 * このフックは「タスク行ドラッグ → 共有 projection → 楽観更新 → move API → 失敗ロールバック」を担う。
 */
export function useTaskMove({
  rows: rowsIndex,
  setTree,
  refetchTree,
}: UseTaskMoveArgs): UseTaskMoveResult {
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [indicator, setIndicator] = useState<MoveIndicator | null>(null);
  // ドラッグ中のサブツリー情報（depth / 除外 id / 元 depth）を握る。
  const activeRef = useRef<{
    taskId: number;
    subtreeDepth: number;
    baseDepth: number;
    exclude: Set<number>;
  } | null>(null);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const data = readMoveData(e);
      if (!data) return;
      const found = rowsIndex.indexOfId.get(data.taskId);
      const baseDepth = found === undefined ? 0 : rowsIndex.rows[found].depth;
      activeRef.current = {
        taskId: data.taskId,
        subtreeDepth: data.subtreeDepth ?? subtreeDepthOf(rowsIndex.rows, data.taskId, rowsIndex),
        baseDepth,
        exclude: subtreeIds(rowsIndex.rows, data.taskId, rowsIndex),
      };
      setActiveTaskId(data.taskId);
      setIndicator(null);
    },
    [rowsIndex],
  );

  // gap droppable + ポインタ横移動量 → projection を計算して緑枠位置を更新。
  const computeProjection = useCallback(
    (e: DragMoveEvent | DragEndEvent): DropProjection | null => {
      const active = activeRef.current;
      const gap = e.over?.data.current as TaskGapData | undefined;
      if (!active || gap?.kind !== 'task-gap') return null;
      return projectDrop({
        rows: rowsIndex.rows,
        index: rowsIndex,
        gapIndex: gap.gapIndex,
        offsetX: e.delta.x,
        indentWidth: INDENT_WIDTH,
        subtreeDepth: active.subtreeDepth,
        excludeIds: active.exclude,
        baseDepth: active.baseDepth,
        boundaryPrependCategoryId: gap.boundaryPrependCategoryId,
      });
    },
    [rowsIndex],
  );

  const onDragMove = useCallback(
    (e: DragMoveEvent) => {
      if (!activeRef.current) return;
      const gap = e.over?.data.current as TaskGapData | undefined;
      const projection = computeProjection(e);
      setIndicator(
        projection && gap?.kind === 'task-gap'
          ? {
              gapIndex: gap.gapIndex,
              depth: projection.depth,
              boundaryPrependCategoryId: gap.boundaryPrependCategoryId,
            }
          : null,
      );
    },
    [computeProjection],
  );

  const commitMove = useCallback(
    async ({ taskId, target }: { taskId: number; target: ResolvedDropTarget }) => {
      // ロールバック用に移動前ツリーを退避してから楽観更新。
      let snapshot: DeskTaskTree | null = null;
      setTree((prev) => {
        snapshot = prev;
        return prev ? applyMove(prev, { taskId, target }) : prev;
      });
      try {
        await moveTask(taskId, {
          parentTaskId: target.parentTaskId,
          categoryId: target.categoryId,
          afterTaskId: target.afterTaskId,
        });
        await refetchTree();
      } catch {
        // 失敗: 移動前スナップショットへロールバック + トースト（spec §4.6）。
        // snapshot=null（楽観更新時点で未ロード）の場合は setTree(null) でロード済みツリーを
        // 潰さないようガードする（指摘[7]）。
        if (snapshot != null) setTree(snapshot);
        toast.error('タスクの移動に失敗しました');
      }
    },
    [setTree, refetchTree],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const wasMoving = activeRef.current != null;
      const data = readMoveData(e);
      const projection = computeProjection(e);
      // 後片付け（移動の成否に関わらず）。
      activeRef.current = null;
      setActiveTaskId(null);
      setIndicator(null);
      // 移動ドラッグでない / ツリー外・無効ゾーンで離した場合は何もしない（元の位置のまま）。
      if (!wasMoving || !data || !projection) return;
      void commitMove({ taskId: data.taskId, target: projection.target });
    },
    [computeProjection, commitMove],
  );

  return useMemo(
    () => ({ activeTaskId, indicator, onDragStart, onDragMove, onDragEnd, commitMove }),
    [activeTaskId, indicator, onDragStart, onDragMove, onDragEnd, commitMove],
  );
}
