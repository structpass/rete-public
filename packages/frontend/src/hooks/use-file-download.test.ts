import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileDownload } from './use-file-download';

// set-0050: 多重起動ガードを state ベース（stale closure で連続呼び出しが両方通りうる）から
// useRef ベースへ変更した回帰テスト。audit-log/members/invites の3画面が共有する hook。

describe('useFileDownload — 多重起動ガード（set-0050）', () => {
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    // saveBlobAsFile が a.click() で実際にダウンロードを起こす副作用を持つため、jsdom の
    // 「Not implemented: navigation」ノイズを避けるためスタブする（quality-review 2026-07-05）。
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('同一マクロタスク内で連続呼び出しても2回目は false を返し fetchBlob は1回だけ呼ばれる', async () => {
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['x']));
    const { result } = renderHook(() => useFileDownload());

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.download(fetchBlob, 'a.csv');
      second = result.current.download(fetchBlob, 'a.csv');
    });
    const [firstResult, secondResult] = await act(async () => Promise.all([first, second]));

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('失敗しても finally でガードが解除され、次回呼び出しは通る', async () => {
    const fetchBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Blob(['x']));
    const onError = vi.fn();
    const { result } = renderHook(() => useFileDownload());

    const r1 = await act(async () => result.current.download(fetchBlob, 'a.csv', { onError }));
    expect(r1).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);

    const r2 = await act(async () => result.current.download(fetchBlob, 'a.csv', { onError }));
    expect(r2).toBe(true);
  });
});
