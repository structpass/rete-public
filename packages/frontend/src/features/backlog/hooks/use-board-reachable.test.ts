import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBoardReachable, BOARD_HEALTH_PATH, BOARD_HEALTH_POLL_MS } from './use-board-reachable';

// Board v2 の疎通判定（no-cors probe → reachable）を検証する。
const fetchMock = vi.fn();
const BOARD_URL = 'http://127.0.0.1:3072';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useBoardReachable', () => {
  it('probe が resolve すれば reachable=true（no-cors・レスポンスは読まない）', async () => {
    fetchMock.mockResolvedValue({ type: 'opaque', ok: false, status: 0 });
    const { result } = renderHook(() => useBoardReachable(BOARD_URL));

    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      `${BOARD_URL}${BOARD_HEALTH_PATH}`,
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
    );
  });

  it('接続拒否（fetch reject）なら reachable=false', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const { result } = renderHook(() => useBoardReachable(BOARD_URL));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('未配線（boardUrl 空）は fetch せず reachable=false', async () => {
    const { result } = renderHook(() => useBoardReachable(''));

    await waitFor(() => expect(result.current).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ポーリング間隔ごとに probe を再実行する', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ type: 'opaque', ok: false, status: 0 });
    const { result } = renderHook(() => useBoardReachable(BOARD_URL));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_HEALTH_POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ウィンドウ復帰（focus）で再 probe する', async () => {
    fetchMock.mockResolvedValue({ type: 'opaque', ok: false, status: 0 });
    const { result } = renderHook(() => useBoardReachable(BOARD_URL));
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
