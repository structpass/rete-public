import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// cmn-0161: 共有 flush helper に統一（microtask drain の逐語重複を解消）
import { flush } from '@/test-utils/flush';

// vi.mock のファクトリは hoisted されるため、外側変数を参照しない（ReferenceError 回避）。
// cmn-0142: vi.hoisted 化
const { fnFetchColumnWidths, fnUpsertColumnWidth, fnResetColumnWidths } = vi.hoisted(() => ({
  fnFetchColumnWidths: vi.fn(),
  fnUpsertColumnWidth: vi.fn(),
  fnResetColumnWidths: vi.fn(),
}));

vi.mock('../api', () => ({
  fetchColumnWidths: fnFetchColumnWidths,
  upsertColumnWidth: fnUpsertColumnWidth,
  resetColumnWidths: fnResetColumnWidths,
}));

import * as api from '../api';
import { useTableColumnWidths, __resetColumnWidthsStoreForTest } from './use-table-column-widths';

const TABLE_ID = 'files-list';
const DEBOUNCE_MS = 300;

function createDeferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useTableColumnWidths — resetWidths と送信済みPUTの順序（fil-0057）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetColumnWidthsStoreForTest();
    vi.mocked(api.fetchColumnWidths).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('送信済み（in-flight）PUTのsettleを待ってからDELETEを送る（順序逆転を防ぐ）', async () => {
    const callOrder: string[] = [];
    const deferredPut = createDeferred<void>();
    vi.mocked(api.upsertColumnWidth).mockImplementation(async () => {
      callOrder.push('put-start');
      await deferredPut.promise;
      callOrder.push('put-settled');
      return { tableId: TABLE_ID, columnKey: 'colA', width: 120, updatedAt: '' };
    });
    vi.mocked(api.resetColumnWidths).mockImplementation(async () => {
      callOrder.push('delete');
    });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {});

    act(() => {
      result.current.setWidth('colA', 120);
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    // debounce 発火直後の PUT はまだ pending（await deferredPut.promise で止まっている）。
    expect(api.upsertColumnWidth).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resetWidths();
    });
    // store は即時クリアされる（体感即時性）。
    expect(result.current.widths).toEqual({});
    // だが DELETE は in-flight PUT の settle を待つためまだ送られない。
    await flush();
    expect(api.resetColumnWidths).not.toHaveBeenCalled();

    // PUT を settle させる。
    await act(async () => {
      deferredPut.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.resetColumnWidths).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['put-start', 'put-settled', 'delete']);
    expect(result.current.widths).toEqual({});
  });

  it('送信済みPUTが失敗してもDELETEは必ず送られる', async () => {
    const callOrder: string[] = [];
    const deferredPut = createDeferred<void>();
    vi.mocked(api.upsertColumnWidth).mockImplementation(async () => {
      callOrder.push('put-start');
      await deferredPut.promise;
      throw new Error('network error');
    });
    vi.mocked(api.resetColumnWidths).mockImplementation(async () => {
      callOrder.push('delete');
    });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {});

    act(() => {
      result.current.setWidth('colA', 120);
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(api.upsertColumnWidth).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resetWidths();
    });

    await act(async () => {
      deferredPut.reject(new Error('network error'));
      await flush();
      await flush();
    });

    expect(api.resetColumnWidths).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['put-start', 'delete']);
  });

  it('同一列へ連続リサイズし複数のPUTがin-flightな時、resetWidthsは全てのsettleを待つ（code-review HIGH）', async () => {
    const callOrder: string[] = [];
    const deferredA = createDeferred<void>();
    const deferredB = createDeferred<void>();
    let call = 0;
    vi.mocked(api.upsertColumnWidth).mockImplementation(async () => {
      call += 1;
      const isFirst = call === 1;
      callOrder.push(isFirst ? 'putA-start' : 'putB-start');
      await (isFirst ? deferredA.promise : deferredB.promise);
      callOrder.push(isFirst ? 'putA-settled' : 'putB-settled');
      return { tableId: TABLE_ID, columnKey: 'colA', width: 100, updatedAt: '' };
    });
    vi.mocked(api.resetColumnWidths).mockImplementation(async () => {
      callOrder.push('delete');
    });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {});

    // 1本目の debounce を発火させ PUT(A) を in-flight にする。
    act(() => {
      result.current.setWidth('colA', 100);
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(api.upsertColumnWidth).toHaveBeenCalledTimes(1);

    // A がまだ pending のうちに同じ列を再度リサイズし、2本目の debounce を発火させ PUT(B) も in-flight にする。
    act(() => {
      result.current.setWidth('colA', 110);
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(api.upsertColumnWidth).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.resetWidths();
    });

    // B だけ settle させても、A がまだ pending なら DELETE は送られない。
    await act(async () => {
      deferredB.resolve();
      await flush();
    });
    expect(api.resetColumnWidths).not.toHaveBeenCalled();

    // A も settle して初めて DELETE が送られる。
    await act(async () => {
      deferredA.resolve();
      await flush();
    });
    expect(api.resetColumnWidths).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual([
      'putA-start',
      'putB-start',
      'putB-settled',
      'putA-settled',
      'delete',
    ]);
  });

  it('未発火のdebounce PUTはリセットでキャンセルされAPIを呼ばない（既存epochガードの回帰確認）', async () => {
    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {});

    act(() => {
      result.current.setWidth('colA', 120);
    });
    // debounce 発火前にリセット。
    act(() => {
      result.current.resetWidths();
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(api.upsertColumnWidth).not.toHaveBeenCalled();
    expect(api.resetColumnWidths).toHaveBeenCalledTimes(1);
  });

  it('リセット後の再リサイズは正しく永続化される（後続書き込みclobberが無い）', async () => {
    vi.mocked(api.upsertColumnWidth).mockResolvedValue({
      tableId: TABLE_ID,
      columnKey: 'colA',
      width: 999,
      updatedAt: '',
    });
    vi.mocked(api.resetColumnWidths).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {});

    act(() => {
      result.current.resetWidths();
    });
    await flush();
    expect(api.resetColumnWidths).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setWidth('colA', 999);
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    await flush();

    expect(api.upsertColumnWidth).toHaveBeenCalledWith(TABLE_ID, 'colA', 999);
    expect(result.current.widths.colA).toBe(999);
  });
});
