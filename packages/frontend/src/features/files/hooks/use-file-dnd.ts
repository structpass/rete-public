'use client';

import { useCallback, useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

/** D&D ペイロード（active/over の data.current）。kind で ツリー reparent / 行移動 / 検索結果移動 を分岐。 */
export interface FileDragData {
  kind: 'tree' | 'row' | 'search';
  /** kind==='tree' のフォルダ id。 */
  fid?: string;
  /** kind==='row' の元 items 配列インデックス（表示順ではなくソース順）。 */
  index?: number;
  /** kind==='search' のヒット種別（folder/file で移動 API を分岐）。 */
  searchKind?: 'folder' | 'file';
  /** kind==='search' の entity id（folder id / file id）。 */
  searchId?: string;
  /** kind==='search' の現在の親フォルダ id（同一親への無駄移動を弾く判定に使う・root は null）。 */
  searchParentFolderId?: string | null;
  label: string;
}

interface UseFileDndArgs {
  onReparent: (nodeFid: string, targetFid: string) => void;
  onMoveRow: (fromIndex: number, targetIndex: number) => void;
  /**
   * 検索結果フォルダ内の項目（kind）をツリーのフォルダ（targetFid）へ移動する（rete-files-0004）。
   * parentFolderId は移動元の現在の親（同一親ドロップの no-op 判定用・root は null）。
   */
  onMoveFromSearch: (
    kind: 'folder' | 'file',
    id: string,
    targetFid: string,
    parentFolderId: string | null,
  ) => void;
}

/**
 * File タブの D&D 制御（Desk と同じ `@dnd-kit` 基盤に統一）。
 * 1 つの DndContext で「ツリーの reparent」と「一覧行の移動」を data.kind で分岐する
 * （desk-shell の昇格/移動の kind 分岐と同型）。クリック誤爆を避けるため 8px 移動まで click 扱い。
 */
export function useFileDnd({ onReparent, onMoveRow, onMoveFromSearch }: UseFileDndArgs) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragStart = useCallback((e: DragStartEvent) => {
    const d = e.active.data.current as FileDragData | undefined;
    setActiveLabel(d?.label ?? null);
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveLabel(null);
      const a = e.active.data.current as FileDragData | undefined;
      const o = e.over?.data.current as FileDragData | undefined;
      if (!a || !o) return;
      if (a.kind === 'tree' && o.kind === 'tree' && a.fid && o.fid) {
        onReparent(a.fid, o.fid);
      } else if (a.kind === 'row' && o.kind === 'row' && a.index != null && o.index != null) {
        onMoveRow(a.index, o.index);
      } else if (a.kind === 'search' && o.kind === 'tree' && a.searchKind && a.searchId && o.fid) {
        // 検索結果フォルダ内の項目をツリーのフォルダへドロップ → 実フォルダへ移動（rete-files-0004）。
        onMoveFromSearch(a.searchKind, a.searchId, o.fid, a.searchParentFolderId ?? null);
      }
    },
    [onReparent, onMoveRow, onMoveFromSearch],
  );

  return { sensors, onDragStart, onDragEnd, activeLabel };
}
