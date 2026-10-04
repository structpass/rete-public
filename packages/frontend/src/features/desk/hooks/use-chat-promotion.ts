'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import type { DragStartEvent, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { promoteChatToTask, fetchChatThemeDetail, type PromotePayload } from '../lib/api';
import type { Task } from '@/features/tasks/lib/api';
import {
  projectDrop,
  INDENT_WIDTH,
  type FlatRowIndex,
  type ResolvedDropTarget,
  type TaskGapData,
} from '../lib/drop-projection';

/** ドラッグ中のテーマ（draggable data に載せるサマリ）。 */
export interface DragTheme {
  id: string;
  title: string;
  description?: string | null;
}

/**
 * 確定した昇格ドロップ先（移動と共通の ResolvedDropTarget を採用）。
 * 緑枠インジケータ・行間モデルへ一本化したため、旧 mode 別 DropZoneData は廃止。
 */
export type DropTarget = ResolvedDropTarget;

/** 昇格 / 移動 共通の緑枠インジケータ（行間 gap + 採用 depth）。 */
export interface DropIndicator {
  gapIndex: number;
  depth: number;
  /**
   * dsk-0256: 分類境界 gap（次カテゴリ先頭行）を実際にホバー中かどうか（prepend 先カテゴリ ID。
   * 未分類バケットは null）。undefined＝通常 gap。同一 gapIndex を奪い合う CategoryAppendZone との
   * 二重シャドウを避けるため、GapDropZone/CategoryAppendZone 双方の showBox がこの値の有無で
   * 描画権を排他的に切り分ける。
   */
  boundaryPrependCategoryId?: number | null;
}

/** 左ペイン昇格フォーム（promote オーバーレイ）の初期状態。 */
export interface PromoteDraft {
  theme: DragTheme;
  target: DropTarget;
}

/** 右ペインに描く仮挿入行（楽観 UI。保存確定 / キャンセルで消える）。行間 gap 位置 + depth で描く。 */
export interface ProvisionalRow {
  title: string;
  gapIndex: number;
  depth: number;
  /** dsk-0256: ドロップ確定時に境界 gap がホバー先だったか（DropIndicator 同名フィールド参照）。 */
  boundaryPrependCategoryId?: number | null;
}

/** フォームが組み立てて savePromotion に渡す（target 抜きの）入力値。 */
export interface PromoteFormValues {
  title: string;
  description?: string;
  /** 説明中の @ メンションから抽出した宛先（dsk-0203・説明面）。空配列は送らない（宛先なし）。 */
  descriptionMentionAccountIds?: string[];
  status?: PromotePayload['status'];
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
}

interface UseChatPromotionArgs {
  /**
   * 行間 projection のための表示行の索引（buildDeskTreeRows の結果を memo したもの）。
   * dsk-0332: ドラッグイベントごとに flattenTree で作り直さず、ツリー更新時の派生値を使う。
   */
  rows: FlatRowIndex;
  refetchTree: () => Promise<void>;
  /** 昇格成功時にチャット明細を取り直す。昇格済みテーマは一覧フィルタで落ちるため、元チャットが消える。 */
  refetchThemes?: () => Promise<void>;
  /**
   * 選択中チャネル（器 / Space）の ID。昇格タスクをこのチャネルに作成する（rete-desk-0175）。
   * 未選択（全件ビュー）時は undefined＝backend が DEFAULT_CHANNEL_ID を刻印する従来挙動。
   */
  spaceId?: string;
}

export interface UseChatPromotionResult {
  activeTheme: DragTheme | null;
  /** 昇格 / 移動 共通の緑枠インジケータ（行間 + 採用 depth）。null=落とせない / 非ホバー。 */
  indicator: DropIndicator | null;
  provisionalRow: ProvisionalRow | null;
  promoteDraft: PromoteDraft | null;
  saving: boolean;
  saveError: string | null;
  onDragStart: (e: DragStartEvent) => void;
  onDragMove: (e: DragMoveEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  /** 昇格を確定する（POST /tasks）。成功で作成 Task / 失敗・未ドラフトで null。id は添付 flush に使う。 */
  savePromotion: (values: PromoteFormValues) => Promise<Task | null>;
  cancelPromotion: () => void;
}

/** 解決済みドロップ先（parent/after）から、昇格フォームに読み取り表示する挿入位置ラベルを導出。 */
export function targetInsertLabel(target: DropTarget): string {
  if (target.parentTaskId != null) {
    return target.afterTaskId != null ? '子タスクとして挿入' : '子タスクの先頭に追加';
  }
  return target.afterTaskId != null ? '兄弟タスクとして挿入' : 'カテゴリ末尾に追加';
}

/**
 * DropTarget + フォーム値 → backend 昇格 payload（POST /tasks）。null の parent/after は省略。
 * spaceId（選択中チャネル）を指定すると昇格タスクをそのチャネルの器に作成する。省略すると backend が
 * DEFAULT_CHANNEL_ID を刻印し、新規チャネルでは作成タスクがそのチャネルのツリーに出てこない（rete-desk-0175）。
 */
export function buildPromotePayload(
  theme: DragTheme,
  target: DropTarget,
  values: PromoteFormValues,
  spaceId?: string,
): PromotePayload {
  const base: PromotePayload = {
    title: values.title,
    description: values.description || undefined,
    status: values.status,
    sourceThemeId: theme.id,
    assigneeName: values.assigneeName || undefined,
    startDate: values.startDate || undefined,
    dueDate: values.dueDate || undefined,
  };
  // 説明面の宛先（dsk-0203）。抽出結果が空なら省略（POST では undefined と [] が等価＝宛先なし）。
  if (values.descriptionMentionAccountIds && values.descriptionMentionAccountIds.length > 0) {
    base.descriptionMentionAccountIds = values.descriptionMentionAccountIds;
  }
  // 分類は任意（rete-desk-0158）。未分類バケットへの昇格（categoryId=null）は省略する（backend が未分類で作成）。
  if (target.categoryId != null) base.categoryId = target.categoryId;
  if (target.parentTaskId != null) base.parentTaskId = target.parentTaskId;
  if (target.afterTaskId != null) base.afterTaskId = target.afterTaskId;
  // 昇格先の器（CM-2 / ADR 0037 §7）。未選択（全件ビュー）時は省略＝backend が DEFAULT を刻印（従来挙動）。
  if (spaceId != null) base.spaceId = spaceId;
  return base;
}

/**
 * チャット → タスク D&D 昇格の状態機械（spec §5.1 昇格固有）。
 * ドロップ先 projection / 緑枠 / 拒否判定は移動（useTaskMove）と共通化した lib/drop-projection を使う
 * （invariant §3 コピペ禁止）。昇格固有 = draggable はチャットテーマ、ドロップ後にフォームを開く。
 */
export function useChatPromotion({
  rows: rowsIndex,
  refetchTree,
  refetchThemes,
  spaceId,
}: UseChatPromotionArgs): UseChatPromotionResult {
  const [activeTheme, setActiveTheme] = useState<DragTheme | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [provisionalRow, setProvisionalRow] = useState<ProvisionalRow | null>(null);
  const [promoteDraft, setPromoteDraft] = useState<PromoteDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 取得中の description prefill が、キャンセル / 別ドロップ後に古い draft を上書きしないための世代カウンタ。
  const draftSeq = useRef(0);

  const onDragStart = useCallback((e: DragStartEvent) => {
    const theme = e.active.data.current?.theme as DragTheme | undefined;
    if (theme) {
      setActiveTheme(theme);
      setIndicator(null);
    }
  }, []);

  // 昇格は新規 1 行の挿入なので subtreeDepth=0 / excludeIds 無し。基準 depth は gap の prev に委ねる。
  // indicator（緑枠）と onDragEnd（確定）の両方が同じ落とし先解決を通る単一ソース（invariant §3）。
  const resolveDrop = useCallback(
    (
      e: DragMoveEvent | DragEndEvent,
    ): {
      gapIndex: number;
      depth: number;
      target: DropTarget;
      boundaryPrependCategoryId?: number | null;
    } | null => {
      const gap = e.over?.data.current as TaskGapData | undefined;
      if (gap?.kind !== 'task-gap') return null;
      const rows = rowsIndex.rows;
      // 空チャネル（新規チャネル / rete-desk-0172）: 行が 1 つも無いと projectDrop は落とし先
      // （categoryId の導出元）を確定できない。唯一の落とし先＝未分類トップレベル先頭へ解決する。
      if (rows.length === 0) {
        return {
          gapIndex: gap.gapIndex,
          depth: 0,
          target: { parentTaskId: null, afterTaskId: null, categoryId: null },
          boundaryPrependCategoryId: gap.boundaryPrependCategoryId,
        };
      }
      const projection = projectDrop({
        rows,
        index: rowsIndex,
        gapIndex: gap.gapIndex,
        offsetX: e.delta.x,
        indentWidth: INDENT_WIDTH,
        subtreeDepth: 0,
        boundaryPrependCategoryId: gap.boundaryPrependCategoryId,
      });
      return projection
        ? {
            gapIndex: gap.gapIndex,
            depth: projection.depth,
            target: projection.target,
            boundaryPrependCategoryId: gap.boundaryPrependCategoryId,
          }
        : null;
    },
    [rowsIndex],
  );

  const computeIndicator = useCallback(
    (e: DragMoveEvent | DragEndEvent): DropIndicator | null => {
      const r = resolveDrop(e);
      return r
        ? {
            gapIndex: r.gapIndex,
            depth: r.depth,
            boundaryPrependCategoryId: r.boundaryPrependCategoryId,
          }
        : null;
    },
    [resolveDrop],
  );

  const onDragMove = useCallback(
    (e: DragMoveEvent) => {
      if (!activeTheme) return;
      setIndicator(computeIndicator(e));
    },
    [activeTheme, computeIndicator],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const theme = e.active.data.current?.theme as DragTheme | undefined;
      const resolved = resolveDrop(e);
      setActiveTheme(null);
      setIndicator(null);
      // ツリー外 / 無効ゾーンのドロップは昇格を起こさない。
      if (!theme || !resolved) return;
      const target = resolved.target;
      setProvisionalRow({
        title: theme.title,
        gapIndex: resolved.gapIndex,
        depth: resolved.depth,
        boundaryPrependCategoryId: resolved.boundaryPrependCategoryId,
      });
      setPromoteDraft({ theme, target });
      setSaveError(null);

      // チャット明細カードは description を持たない（summary）。フォームの description プリフィルのため
      // テーマ詳細を遅延取得し、まだ同じ draft が開いていれば description だけ後追いで埋める。
      if (theme.description == null) {
        const seq = (draftSeq.current += 1);
        void fetchChatThemeDetail(theme.id)
          .then((detail) => {
            setPromoteDraft((prev) =>
              prev && prev.theme.id === theme.id && draftSeq.current === seq
                ? { ...prev, theme: { ...prev.theme, description: detail.description } }
                : prev,
            );
          })
          .catch(() => {
            // description は任意。取得失敗時は title のみで続行する（昇格自体は妨げない）。
          });
      }
    },
    [resolveDrop],
  );

  const savePromotion = useCallback(
    async (values: PromoteFormValues): Promise<Task | null> => {
      if (!promoteDraft) return null;
      setSaving(true);
      setSaveError(null);
      try {
        const created = await promoteChatToTask(
          buildPromotePayload(promoteDraft.theme, promoteDraft.target, values, spaceId),
        );
        // ツリー（新タスク反映）とチャット明細（昇格済みテーマの除外）を両方取り直す。
        await Promise.all([refetchTree(), refetchThemes?.()]);
        setProvisionalRow(null);
        setPromoteDraft(null);
        return created;
      } catch {
        // 失敗時は仮挿入行 / ドラフトを残し、再試行できるようにする（§4.6）。
        setSaveError('タスクの作成に失敗しました');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [promoteDraft, refetchTree, refetchThemes, spaceId],
  );

  const cancelPromotion = useCallback(() => {
    // seq を進め、進行中の description prefill が消えた draft を復活させないようにする。
    draftSeq.current += 1;
    setProvisionalRow(null);
    setPromoteDraft(null);
    setSaveError(null);
  }, []);

  return useMemo(
    () => ({
      activeTheme,
      indicator,
      provisionalRow,
      promoteDraft,
      saving,
      saveError,
      onDragStart,
      onDragMove,
      onDragEnd,
      savePromotion,
      cancelPromotion,
    }),
    [
      activeTheme,
      indicator,
      provisionalRow,
      promoteDraft,
      saving,
      saveError,
      onDragStart,
      onDragMove,
      onDragEnd,
      savePromotion,
      cancelPromotion,
    ],
  );
}
