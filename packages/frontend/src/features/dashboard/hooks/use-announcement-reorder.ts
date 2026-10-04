'use client';

import type { DragEndEvent } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import {
  useOptimisticReorder,
  type UseOptimisticReorderResult,
} from '@/hooks/use-optimistic-reorder';
import type { AnnouncementSummary } from '../lib/api';

/** useAnnouncementReorder の返り（DashboardView の DnD 配線が使う）。 */
export interface UseAnnouncementReorderResult {
  /** DndContext へ渡すセンサー（ポインター 4px 閾値で click と分離 + キーボード）。 */
  sensors: UseOptimisticReorderResult['sensors'];
  /** DndContext の onDragEnd ハンドラ。新順序を hook の reorder（楽観更新 + 永続化）へ委譲する。 */
  handleDragEnd: (event: DragEndEvent) => void;
}

/**
 * 掲示板一覧の D&D 並び替え配線（H0021）。DashboardView から DnD のセンサー設定・in-flight ガード・
 * arrayMove → 永続化委譲を切り出し、コンポーネント本体の責務集中を避ける（code-review HIGH）。
 * - cmn-0357: センサー設定・共通判定・順序計算・施錠は共通フック useOptimisticReorder へ移した
 *   （本フックは写し元＝共通フックの雛形。残るのは掲示板固有の「id 列へ畳んで委譲・失敗は toast」だけ）。
 * - 実際の楽観更新 + 永続化 + 失敗ロールバックは渡された reorder（useAnnouncements）が担う。
 */
export function useAnnouncementReorder(
  items: AnnouncementSummary[],
  reorder: (orderedIds: string[]) => Promise<void>,
): UseAnnouncementReorderResult {
  // cmn-0409 LOW 3: onReorder は useCallback で包まない。共通フックが毎レンダー ref へ写して読むため
  // 同一性は使われず、安定性の契約があるかのように読める包み方は無意味。直接定義して渡す。
  const onReorder = async (reordered: AnnouncementSummary[]) => {
    try {
      await reorder(reordered.map((a) => a.id));
    } catch {
      toast.error('並び替えの保存に失敗しました');
    }
  };

  const { sensors, handleDragEnd } = useOptimisticReorder<AnnouncementSummary>({
    items,
    onReorder,
  });

  return { sensors, handleDragEnd };
}
