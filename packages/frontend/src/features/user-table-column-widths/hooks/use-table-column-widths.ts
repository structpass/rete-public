'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import type { TableId } from '@rete/shared';
import { fetchColumnWidths, resetColumnWidths, upsertColumnWidth } from '../api';

/**
 * 列幅永続化用 module store。
 * tableId 単位に { columnKey: width } を保持する。
 *
 * 動作仕様:
 * - 楽観更新: drag 中に store を即時書き換え（DOM へ即反映）
 * - debounced PUT: drag end (mouseup) 後 300ms で 1 度だけ API 呼び出し
 * - 競合制御: last-write-wins。失敗時は revalidate で巻き戻す
 * - 読み込み時クランプ: 呼び出し側で max(savedWidth, minWidth) を行う想定
 */
type Listener = () => void;

interface TableState {
  widths: Record<string, number>;
  initialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

const tables = new Map<TableId, TableState>();
const listeners = new Map<TableId, Set<Listener>>();
const inflightFetches = new Map<TableId, Promise<void>>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// 送信済み（in-flight）の列幅 PUT（fil-0057）。resetWidths が DELETE を送る前にこれらの settle を
// 待つことで、DELETE → PUT の順序逆転（旧幅の再保存）を防ぐ。settle は成功/失敗いずれでも解ける
// （PUT 失敗時も DELETE は必ず走る）。同一 key（同一列）へ低速ネットワーク中に連続リサイズすると
// 前の PUT がまだ pending のまま次の PUT が発火しうるため、単一 Promise でなく Set で蓄積する
// （code-review HIGH: Map だと後発 PUT が先発を上書きして待ち漏らす）。
const inflightPuts = new Map<string, Set<Promise<void>>>();
// リセット世代（fil-0054 review HIGH/MEDIUM）。resetWidths のたびに +1 する。
// in-flight の GET(revalidate) / debounce 発火後の PUT が、リセット後の空 widths を
// 旧値で上書き・再保存するのを防ぐため、開始時の epoch を握って完了時に変化を検知したら破棄する。
const resetEpochs = new Map<TableId, number>();

function currentEpoch(tableId: TableId): number {
  return resetEpochs.get(tableId) ?? 0;
}

const DEBOUNCE_MS = 300;

function emptyTableState(): TableState {
  return { widths: {}, initialized: false, isLoading: false, error: null };
}

function ensureTable(tableId: TableId): TableState {
  let s = tables.get(tableId);
  if (!s) {
    s = emptyTableState();
    tables.set(tableId, s);
  }
  return s;
}

function emit(tableId: TableId) {
  const set = listeners.get(tableId);
  if (set) for (const l of set) l();
}

function setTable(tableId: TableId, next: Partial<TableState>) {
  const cur = ensureTable(tableId);
  tables.set(tableId, { ...cur, ...next });
  emit(tableId);
}

function subscribe(tableId: TableId, l: Listener): () => void {
  let set = listeners.get(tableId);
  if (!set) {
    set = new Set();
    listeners.set(tableId, set);
  }
  set.add(l);
  return () => {
    set!.delete(l);
  };
}

async function revalidate(tableId: TableId): Promise<void> {
  const existing = inflightFetches.get(tableId);
  if (existing) return existing;
  const startEpoch = currentEpoch(tableId);
  const p = (async () => {
    setTable(tableId, { isLoading: true });
    try {
      const list = await fetchColumnWidths(tableId);
      // フェッチ中にリセットが走っていたら、旧値で空 widths を上書きしない（review HIGH）。
      if (currentEpoch(tableId) !== startEpoch) {
        setTable(tableId, { isLoading: false, initialized: true });
        return;
      }
      const widths: Record<string, number> = {};
      for (const item of list) {
        widths[item.columnKey] = item.width;
      }
      setTable(tableId, { widths, isLoading: false, error: null, initialized: true });
    } catch (err) {
      if (currentEpoch(tableId) !== startEpoch) {
        setTable(tableId, { isLoading: false, initialized: true });
        return;
      }
      setTable(tableId, {
        isLoading: false,
        error: err instanceof Error ? err : new Error('fetch failed'),
        initialized: true,
      });
    } finally {
      inflightFetches.delete(tableId);
    }
  })();
  inflightFetches.set(tableId, p);
  return p;
}

/**
 * すべての table state を初期化。ログアウト時に呼ぶ。
 */
export function resetColumnWidthsStore() {
  tables.clear();
  inflightFetches.clear();
  inflightPuts.clear();
  resetEpochs.clear();
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
  for (const set of listeners.values()) {
    for (const l of set) l();
  }
}

/** テスト用エイリアス */
export const __resetColumnWidthsStoreForTest = resetColumnWidthsStore;

export function useTableColumnWidths(tableId: TableId) {
  // tableId に対応する snapshot を取り出す。tableId 単位で subscribe する
  const snapshot = useSyncExternalStore(
    useCallback((l) => subscribe(tableId, l), [tableId]),
    useCallback(() => ensureTable(tableId), [tableId]),
    useCallback(() => ensureTable(tableId), [tableId]),
  );
  const initRef = useRef<Set<TableId>>(new Set());

  useEffect(() => {
    const cur = ensureTable(tableId);
    if (!cur.initialized && !inflightFetches.has(tableId) && !initRef.current.has(tableId)) {
      initRef.current.add(tableId);
      void revalidate(tableId);
    }
  }, [tableId]);

  /**
   * 列幅を更新する（楽観更新 + debounced PUT）。
   * drag 中の連続呼び出しは store だけ即時更新し、最後の呼び出しから 300ms で 1 度 API に flush する。
   */
  const setWidth = useCallback(
    (columnKey: string, width: number) => {
      // backend DTO は @IsInt() のため、入口で整数に丸める（PointerEvent.clientX が小数を返すケースに防衛）
      const w = Math.round(width);
      const cur = ensureTable(tableId);
      setTable(tableId, { widths: { ...cur.widths, [columnKey]: w } });

      const scheduledEpoch = currentEpoch(tableId);
      const timerKey = `${tableId}::${columnKey}`;
      const existing = debounceTimers.get(timerKey);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceTimers.delete(timerKey);
        // 発火前にリセットが走っていたら旧幅を再保存しない（review MEDIUM）。
        if (currentEpoch(tableId) !== scheduledEpoch) return;
        const finalWidth = ensureTable(tableId).widths[columnKey] ?? w;
        const putPromise: Promise<void> = upsertColumnWidth(tableId, columnKey, finalWidth)
          .catch(() => {
            toast.error('列幅の保存に失敗しました');
            void revalidate(tableId);
          })
          .then(() => undefined);
        let set = inflightPuts.get(timerKey);
        if (!set) {
          set = new Set();
          inflightPuts.set(timerKey, set);
        }
        set.add(putPromise);
        void putPromise.finally(() => {
          set!.delete(putPromise);
          if (set!.size === 0) inflightPuts.delete(timerKey);
        });
      }, DEBOUNCE_MS);
      debounceTimers.set(timerKey, timer);
    },
    [tableId],
  );

  /**
   * 列幅を既定へリセットする（fil-0054）。
   * 楽観的に store を即時クリア → 当該 table の pending debounce PUT を取り消し
   * → 送信済み（in-flight）PUT の settle を待ってから → 永続値を DELETE。
   * 送信済み PUT を待たずに DELETE すると、サーバ側の処理順序逆転（DELETE→PUT）で
   * 旧幅が再保存される残窓があるため、DELETE は必ず in-flight PUT の後に送る（fil-0057）。
   * store の即時クリアは待たないため体感即時性は変わらない。失敗時は revalidate で
   * サーバ状態へ巻き戻す（last-write-wins と同じ復旧方針）。
   */
  const resetWidths = useCallback(() => {
    // 世代を進め、進行中の GET / 発火待ちの PUT を無効化する（review HIGH/MEDIUM）。
    resetEpochs.set(tableId, currentEpoch(tableId) + 1);
    setTable(tableId, { widths: {}, initialized: true });
    for (const [key, timer] of debounceTimers) {
      if (key.startsWith(`${tableId}::`)) {
        clearTimeout(timer);
        debounceTimers.delete(key);
      }
    }
    const pendingPuts: Promise<void>[] = [];
    for (const [key, set] of inflightPuts) {
      if (key.startsWith(`${tableId}::`)) pendingPuts.push(...set);
    }
    void (async () => {
      if (pendingPuts.length > 0) await Promise.allSettled(pendingPuts);
      try {
        await resetColumnWidths(tableId);
      } catch {
        toast.error('列幅のリセットに失敗しました');
        void revalidate(tableId);
      }
    })();
  }, [tableId]);

  return {
    widths: snapshot.widths,
    initialized: snapshot.initialized,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    setWidth,
    resetWidths,
    revalidate: useCallback(() => revalidate(tableId), [tableId]),
  };
}
