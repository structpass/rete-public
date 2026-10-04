import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useReferenceReachable } from '../use-reference-reachable';
// cmn-0161: アンマウント後の microtask drain を共有 flush helper に統一
import { flush } from '@/test-utils/flush';

// fetch をモックして「到達可否 → reachable boolean」の写しと probe 抑止条件を検証する。
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReferenceReachable', () => {
  it('enabled=false なら probe せず楽観 true を返す（available=false タブは既に灰色）', async () => {
    const { result } = renderHook(() => useReferenceReachable('http://localhost:3000', false));
    expect(result.current).toBe(true);
    // マイクロタスクを 1 周させても fetch は呼ばれない。
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('url=null なら probe しない', async () => {
    renderHook(() => useReferenceReachable(null, true));
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch が resolve（到達可能）なら reachable=true を保つ', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useReferenceReachable('http://localhost:3000', true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(true);
    // no-cors / no-store でクロスオリジン到達確認している。
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000',
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
    );
  });

  it('fetch が reject（接続拒否）なら reachable=false に倒す', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useReferenceReachable('http://localhost:3000', true));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('window focus で再 probe する（後から reference を起動したケースを拾う）', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    renderHook(() => useReferenceReachable('http://localhost:3000', true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('一度 false に倒れたら focus 再 probe が成功しても true へ戻さない（有効→無効ラッチ / rete-common-0023）', async () => {
    // 初回 probe は reject（到達不能）→ false。以降の probe が resolve（到達可能）でも、チラつき防止の
    // ラッチにより false を維持する（都度判定は続けるが片方向）。
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { result } = renderHook(() => useReferenceReachable('http://localhost:3000', true));
    await waitFor(() => expect(result.current).toBe(false));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    // 再 probe 自体は走る（都度判定は継続）。
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // しかし成功 probe でも true へは戻らない（ラッチ）。
    expect(result.current).toBe(false);
  });

  it('アンマウントで in-flight probe を abort し、その reject で reachable を倒さない（post-unmount setState 防止）', async () => {
    // signal が abort されたら reject する pending fetch。アンマウントで abort → catch が signal.aborted を
    // 見て setReachable(false) をスキップする（楽観 true のまま）ことを確認する。
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { result, unmount } = renderHook(() =>
      useReferenceReachable('http://localhost:3000', true),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    await flush();
    expect(result.current).toBe(true);
  });
});
