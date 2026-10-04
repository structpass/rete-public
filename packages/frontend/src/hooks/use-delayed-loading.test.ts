import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDelayedLoading } from './use-delayed-loading';

describe('useDelayedLoading — スピナー遅延表示 hook（dsk-0234）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loading=false の間は遅延表示も false', () => {
    const { result } = renderHook(() => useDelayedLoading(false, 200));
    expect(result.current).toBe(false);
  });

  it('loading=true 直後は閾値前なので false（即描画しない）', () => {
    const { result } = renderHook(() => useDelayedLoading(true, 200));
    expect(result.current).toBe(false);
  });

  it('loading=true が閾値継続したら true になる', () => {
    const { result } = renderHook(() => useDelayedLoading(true, 200));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);
  });

  it('閾値前に loading=false へ戻れば一度も true にならない（フラッシュ抑制）', () => {
    const { result, rerender } = renderHook(({ l }) => useDelayedLoading(l, 200), {
      initialProps: { l: true },
    });
    act(() => {
      vi.advanceTimersByTime(50); // 高速ロード（50ms で解決）
    });
    rerender({ l: false });
    act(() => {
      vi.advanceTimersByTime(300); // 元タイマーが残っていても発火しないこと
    });
    expect(result.current).toBe(false);
  });

  it('loading が再度 true になるとタイマーを張り直して閾値後に true', () => {
    const { result, rerender } = renderHook(({ l }) => useDelayedLoading(l, 200), {
      initialProps: { l: false },
    });
    rerender({ l: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);
  });
});
