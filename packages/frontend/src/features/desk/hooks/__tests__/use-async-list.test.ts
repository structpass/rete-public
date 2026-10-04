import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsyncList } from '../use-async-list';

// 軽量リスト取得 helper（§3/§6 共通化）。取得成功 / エラー / reload / stale race 回避を検証する。
describe('useAsyncList', () => {
  it('マウント時に 1 度取得して items に保持する', async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useAsyncList(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([1, 2, 3]);
    expect(result.current.error).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('取得失敗で error フラグが立ち items は空のまま', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAsyncList(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it('reload で再取得して error から回復する', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(['ok']);
    const { result } = renderHook(() => useAsyncList(fetcher));

    await waitFor(() => expect(result.current.error).toBe(true));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.error).toBe(false);
    expect(result.current.items).toEqual(['ok']);
  });

  it('fetcher 飛行中に差し替わると古いレスポンスで新 state を上書きしない（stale race 回避）', async () => {
    // 旧 fetcher は遅延 resolve、新 fetcher は即 resolve。cleanup の ignore フラグで旧結果を捨てる。
    let resolveOld: (v: number[]) => void = () => {};
    const oldFetcher = vi.fn().mockImplementation(
      () =>
        new Promise<number[]>((r) => {
          resolveOld = r;
        }),
    );
    const newFetcher = vi.fn().mockResolvedValue([9]);

    const { result, rerender } = renderHook(({ f }) => useAsyncList(f), {
      initialProps: { f: oldFetcher },
    });
    // fetcher を差し替え（旧はまだ pending）。
    rerender({ f: newFetcher });
    await waitFor(() => expect(result.current.items).toEqual([9]));

    // 旧 fetcher を後から resolve しても items は新結果のまま（上書きされない）。
    act(() => resolveOld([1, 2, 3]));
    await waitFor(() => expect(result.current.items).toEqual([9]));
  });
});
