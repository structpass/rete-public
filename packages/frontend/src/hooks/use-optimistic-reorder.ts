'use client';

import { useCallback, useRef } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/** 並べ替え対象の最小要件（dnd-kit の id 比較に載る id を持つこと）。 */
export interface ReorderableItem {
  id: UniqueIdentifier;
}

export interface UseOptimisticReorderOptions<T extends ReorderableItem> {
  /** 並べ替え対象の配列（分類設定のように部分集合を渡す画面もある）。 */
  items: T[];
  /**
   * 追加の抑止条件（他操作の往復中など）。true を返す間はドロップ確定を無視する。
   * 呼ぶ側が state / ref のどちらで持っていてもよいよう関数で受け、毎レンダー最新を読む。
   */
  isBlocked?: () => boolean;
  /**
   * 新順序が確定した時の処理（楽観更新・永続化・失敗時の後始末は呼び出し側の責務）。
   * 返り Promise の解決・棄却いずれでも施錠は解ける。
   */
  onReorder: (reordered: T[]) => Promise<unknown>;
}

export interface UseOptimisticReorderResult {
  /** DndContext へ渡すセンサー（ポインター 4px 閾値で click と分離 + キーボード）。 */
  sensors: ReturnType<typeof useSensors>;
  /** DndContext の onDragEnd ハンドラ。 */
  handleDragEnd: (event: DragEndEvent) => void;
  /** 並べ替え保存の in-flight 施錠の現在値を返す（横断ガードの参照用・書き込み不可）。 */
  isReordering: () => boolean;
  /** 施錠の取り残しリセット。往復実行中は無視し、finally に解錠を委ねる（早期解除しない）。 */
  resetReordering: () => void;
}

/**
 * 一覧の D&D 楽観的並び替えの共通土台（cmn-0357）。写し元＝掲示板の use-announcement-reorder.ts。
 *
 * 4 サイト（掲示板 / お気に入りの管理 / テナント設定のシステム一覧 / デスクの分類設定）で
 * 実測一致していた「センサー設定・ドロップ確定の共通判定・新順序の計算・保存往復中の施錠」だけを
 * 引き受ける。保存の呼び先と失敗時の見せ方は各画面ごとに違うため onReorder として呼び出し側に残す。
 *
 * items / isBlocked / onReorder は毎レンダー ref へ写して読むため handleDragEnd は同一性が安定する
 * （ドロップは常に描画後に起きるので、読む値は従来の閉包と同じ「その時点の最新」）。
 * なお、このレンダー中 ref 書き込みは React 18 の並行レンダリング（startTransition / Suspense で
 * 破棄されるレンダー）では未コミット値が ref に残りうる。現 4 サイトは transition 未使用で実害はないが、
 * transition 導入時は useInsertionEffect 代入への寄せを検討する（cmn-0409 MEDIUM 2）。
 *
 * onReorder の実行は try/catch/finally の async IIFE で包む（cmn-0357 の改善）。写し元は
 * void reorder().catch().finally() だったため、reorder が同期例外を投げると handleDragEnd の外へ
 * 伝播し施錠が true のまま残った。本フックは同期 throw も捕捉して施錠を必ず解く（parity #14・cmn-0409）。
 */
export function useOptimisticReorder<T extends ReorderableItem>({
  items,
  isBlocked,
  onReorder,
}: UseOptimisticReorderOptions<T>): UseOptimisticReorderResult {
  // D&D センサー（ポインター 4px 閾値で click と分離 + キーボード）。4 サイトで同一設定だったもの。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 並び替え保存の in-flight ガード（往復中の連続ドラッグによる楽観更新/ロールバックの交錯を防ぐ）。
  const reorderingRef = useRef(false);
  // 保存の async IIFE が往復実行中か（finally 未到達）。resetReordering が「往復中は解錠しない」ための判定。
  // 注: reorderingRef とは常に同期して同じ値になる（同一の同期ブロックで true にし finally で false にする）が、
  // 「施錠中か（読み取り）」と「往復中か（リセット可否）」を別の名前で持つことで、close 時リセットの文脈で
  // 「往復中は触らない」ことを意図として明示する（cmn-0409 MEDIUM 3 / MEDIUM 5）。
  const inFlightRef = useRef(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const isBlockedRef = useRef(isBlocked);
  isBlockedRef.current = isBlocked;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    // 一覧の外で離した / 同じ位置へ戻した / 保存の往復中 / 呼び出し側の追加抑止 は何もしない。
    if (!over || active.id === over.id || reorderingRef.current) return;
    if (isBlockedRef.current?.()) return;

    const current = itemsRef.current;
    const oldIndex = current.findIndex((item) => item.id === active.id);
    const newIndex = current.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(current, oldIndex, newIndex);
    reorderingRef.current = true;
    inFlightRef.current = true;
    void (async () => {
      try {
        await onReorderRef.current(reordered);
      } catch (e) {
        // 失敗時の見せ方（トースト / 画面内エラー / ロールバック / 再取得）は呼び出し側の責務。
        // ここへ落ちるのは呼び出し側の catch も通らなかった想定外の例外だけ＝無音にしない（cmn-0409 MEDIUM 1）。
        console.error('[useOptimisticReorder] onReorder threw', e);
      } finally {
        inFlightRef.current = false;
        reorderingRef.current = false;
      }
    })();
  }, []);

  const isReordering = useCallback(() => reorderingRef.current, []);

  const resetReordering = useCallback(() => {
    // 往復実行中は finally に解錠を委ねる（早期解除すると、まだ生きている reorder 失敗経路の
    // load() と再オープン直後の load() が交錯しうる・cmn-0409 MEDIUM 5）。
    if (!inFlightRef.current) reorderingRef.current = false;
  }, []);

  return { sensors, handleDragEnd, isReordering, resetReordering };
}
