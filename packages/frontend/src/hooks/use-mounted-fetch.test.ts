import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMountedFetch } from './use-mounted-fetch';

// set-0047: settings 画面群が共有する「unmount 後の setState 抑止」ガード契約を
// hook 本体で直接検証する（quality-review 2026-07-05 で検出されたテスト欠落を解消）。

describe('useMountedFetch — alive() ガードの契約（set-0047）', () => {
  it('マウント時に fetcher(alive) を1回呼び、alive() は true を返す', () => {
    const aliveValues: boolean[] = [];
    const fetcher = vi.fn((alive: () => boolean) => {
      aliveValues.push(alive());
    });

    renderHook(() => useMountedFetch(fetcher, []));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(aliveValues).toEqual([true]);
  });

  it('unmount 後は alive() が false を返す（非同期完了時の setState 抑止判定に使う）', () => {
    let capturedAlive: (() => boolean) | undefined;
    const fetcher = vi.fn((alive: () => boolean) => {
      capturedAlive = alive;
    });

    const { unmount } = renderHook(() => useMountedFetch(fetcher, []));
    expect(capturedAlive?.()).toBe(true);

    unmount();

    expect(capturedAlive?.()).toBe(false);
  });

  it('deps が変わると再実行され、直前の alive() は false に切り替わる（stale request 破棄）', () => {
    const captured: Array<() => boolean> = [];
    const fetcher = vi.fn((alive: () => boolean) => {
      captured.push(alive);
    });

    const { rerender } = renderHook(({ dep }) => useMountedFetch(fetcher, [dep]), {
      initialProps: { dep: 1 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ dep: 2 });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(captured[0]()).toBe(false);
    expect(captured[1]()).toBe(true);
  });

  it('fetcher が Promise を返す非同期関数でも例外を投げない', async () => {
    const fetcher = vi.fn(async (alive: () => boolean) => {
      await Promise.resolve();
      expect(alive()).toBe(true);
    });

    expect(() => renderHook(() => useMountedFetch(fetcher, []))).not.toThrow();
  });
});
