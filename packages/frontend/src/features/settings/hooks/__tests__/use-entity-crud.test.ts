import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useEntityCrud } from '../use-entity-crud';

interface Row {
  id: string;
  name: string;
}

/** 解決タイミングを外から制御できる Promise（後着順を固定するため）。 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useEntityCrud', () => {
  it('fetchFn 参照が変わって取得が並走した時、最後に投げた取得の結果だけを採用する（set-0150）', async () => {
    // アーカイブ絞り込みチップの高速往復＝fetchFn 参照が続けて変わる状況を、解決順を逆にして再現する。
    const first = deferred<Row[]>();
    const second = deferred<Row[]>();
    const fetchA = vi.fn(() => first.promise);
    const fetchB = vi.fn(() => second.promise);
    const createFn = vi.fn();
    const updateFn = vi.fn();

    const { result, rerender } = renderHook(
      ({ fetchFn }: { fetchFn: () => Promise<Row[]> }) =>
        useEntityCrud<Row>({ fetchFn, createFn, updateFn }),
      { initialProps: { fetchFn: fetchA } },
    );

    // 1 回目の取得が未解決のまま 2 回目（最新）を投げる。
    rerender({ fetchFn: fetchB });
    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);

    // 最新（2 回目）が先に解決し、そのあと古い 1 回目が後着する。
    await act(async () => {
      second.resolve([{ id: 'b', name: '最新' }]);
      await second.promise;
    });
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'b', name: '最新' }]));

    await act(async () => {
      first.resolve([{ id: 'a', name: '古い' }]);
      await first.promise;
    });

    // 後着した古い結果で上書きされない。
    expect(result.current.items).toEqual([{ id: 'b', name: '最新' }]);
    expect(result.current.isLoading).toBe(false);
  });

  it('古い取得が後着しても、走っている最新取得の読み込み表示を消さない（set-0150）', async () => {
    const first = deferred<Row[]>();
    const second = deferred<Row[]>();
    const fetchA = vi.fn(() => first.promise);
    const fetchB = vi.fn(() => second.promise);

    const { result, rerender } = renderHook(
      ({ fetchFn }: { fetchFn: () => Promise<Row[]> }) =>
        useEntityCrud<Row>({ fetchFn, createFn: vi.fn(), updateFn: vi.fn() }),
      { initialProps: { fetchFn: fetchA } },
    );

    rerender({ fetchFn: fetchB });
    expect(result.current.isLoading).toBe(true);

    // 最新がまだ走っている間に古いほうが解決する。
    await act(async () => {
      first.resolve([{ id: 'a', name: '古い' }]);
      await first.promise;
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);

    await act(async () => {
      second.resolve([{ id: 'b', name: '最新' }]);
      await second.promise;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ id: 'b', name: '最新' }]);
  });

  it('単発の取得は通常どおり一覧へ反映する（世代カウンタが素の経路を壊していないこと）', async () => {
    const fetchFn = vi.fn(async () => [{ id: 'a', name: '組織A' }]);
    const { result } = renderHook(() =>
      useEntityCrud<Row>({ fetchFn, createFn: vi.fn(), updateFn: vi.fn() }),
    );
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'a', name: '組織A' }]));
    expect(result.current.isLoading).toBe(false);
  });
});
