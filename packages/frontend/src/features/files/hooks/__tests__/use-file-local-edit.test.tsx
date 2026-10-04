import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// API・toast をモックし、ローカル編集セッション（fil-0075）の
// begin（picker→書き出し→監視開始）/ 変更検知→自動アップロード / stop（タイマー停止）を検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchFileBlob, uploadFileVersion, toastSuccess, toastError } = vi.hoisted(() => ({
  fetchFileBlob: vi.fn(),
  uploadFileVersion: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchFileBlob: (...a: unknown[]) => fetchFileBlob(...a),
  uploadFileVersion: (...a: unknown[]) => uploadFileVersion(...a),
  // 純粋関数はそのまま（suggestedName へのサニタイズ適用 fil-0076）。
  sanitizeDownloadName: (name: string) => name,
}));
vi.mock('react-hot-toast', () => ({
  default: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { useFileLocalEdit } from '../use-file-local-edit';

const TARGET = { id: 'file-1', name: 'report.xlsx', versionNo: 3 };

/** showSaveFilePicker が返すハンドルのモック。getFile() の lastModified を後から進められる。 */
function makeHandle(initialModified = 1000) {
  let lastModified = initialModified;
  const write = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const handle = {
    getFile: vi.fn(async () => ({ lastModified, name: 'report.xlsx' }) as unknown as File),
    createWritable: vi.fn(async () => ({ write, close })),
  };
  return {
    handle,
    write,
    close,
    touch(next: number) {
      lastModified = next;
    },
  };
}

type PickerWindow = Window & { showSaveFilePicker?: unknown };

beforeEach(() => {
  vi.useFakeTimers();
  fetchFileBlob.mockReset().mockResolvedValue(new Blob(['data']));
  uploadFileVersion.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  delete (window as PickerWindow).showSaveFilePicker;
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as PickerWindow).showSaveFilePicker;
});

describe('useFileLocalEdit', () => {
  it('showSaveFilePicker 非対応環境では supported=false・begin は unsupported を返す', async () => {
    const { result } = renderHook(() => useFileLocalEdit());
    expect(result.current.supported).toBe(false);
    let r: string | undefined;
    await act(async () => {
      r = await result.current.begin(TARGET);
    });
    expect(r).toBe('unsupported');
    expect(fetchFileBlob).not.toHaveBeenCalled();
  });

  it('begin: picker→blob 書き出し→watching へ遷移する', async () => {
    const { handle, write, close } = makeHandle();
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => handle);
    const { result } = renderHook(() => useFileLocalEdit());

    let r: string | undefined;
    await act(async () => {
      r = await result.current.begin(TARGET);
    });
    expect(r).toBe('started');
    expect((window as PickerWindow).showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'report.xlsx',
    });
    expect(fetchFileBlob).toHaveBeenCalledWith('file-1');
    expect(write).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(result.current.status).toBe('watching');
    expect(result.current.target).toEqual(TARGET);
  });

  it('begin: picker キャンセル（AbortError）は cancelled を返し idle のまま', async () => {
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    const { result } = renderHook(() => useFileLocalEdit());
    let r: string | undefined;
    await act(async () => {
      r = await result.current.begin(TARGET);
    });
    expect(r).toBe('cancelled');
    expect(result.current.status).toBe('idle');
    expect(fetchFileBlob).not.toHaveBeenCalled();
  });

  it('ローカル保存（lastModified 変化）を検知したら新版を自動アップロードし toast を出す', async () => {
    const { handle, touch } = makeHandle(1000);
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => handle);
    uploadFileVersion.mockResolvedValue({ versionNo: 4 });
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useFileLocalEdit({ onUploaded }));

    await act(async () => {
      await result.current.begin(TARGET);
    });

    // 変更なしの tick ではアップロードしない。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(uploadFileVersion).not.toHaveBeenCalled();

    // ローカル保存を模擬 → 次の tick で自動アップロード。
    touch(2000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(uploadFileVersion).toHaveBeenCalledTimes(1);
    expect(uploadFileVersion.mock.calls[0][0]).toBe('file-1');
    expect(toastSuccess).toHaveBeenCalledWith('新しい版（v4）を保存しました');
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(result.current.lastVersionNo).toBe(4);
    expect(result.current.status).toBe('watching');

    // 同じ lastModified のままなら再アップロードしない。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(uploadFileVersion).toHaveBeenCalledTimes(1);
  });

  it('stop: 監視を止め idle へ戻す（以降の tick でアップロードが走らない）', async () => {
    const { handle, touch } = makeHandle(1000);
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => handle);
    const { result } = renderHook(() => useFileLocalEdit());

    await act(async () => {
      await result.current.begin(TARGET);
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.target).toBeNull();

    touch(2000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(uploadFileVersion).not.toHaveBeenCalled();
  });

  it('アンマウントで監視タイマーが止まる（タイマー残留なし）', async () => {
    const { handle, touch } = makeHandle(1000);
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => handle);
    const { result, unmount } = renderHook(() => useFileLocalEdit());

    await act(async () => {
      await result.current.begin(TARGET);
    });
    unmount();
    touch(2000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(uploadFileVersion).not.toHaveBeenCalled();
  });

  it('begin の picker 待機中にアンマウントされたら監視を開始しない（世代ガード）', async () => {
    const { handle, touch } = makeHandle(1000);
    let resolvePicker: ((h: unknown) => void) | undefined;
    (window as PickerWindow).showSaveFilePicker = vi.fn(
      () => new Promise((resolve) => (resolvePicker = resolve)),
    );
    const { result, unmount } = renderHook(() => useFileLocalEdit());

    let beginPromise: Promise<string> | undefined;
    act(() => {
      beginPromise = result.current.begin(TARGET);
    });
    // picker ダイアログ表示中に画面遷移（アンマウント）。
    unmount();
    resolvePicker?.(handle);
    let r: string | undefined;
    await act(async () => {
      r = await beginPromise;
    });
    expect(r).toBe('cancelled');
    expect(fetchFileBlob).not.toHaveBeenCalled();

    // 監視タイマーが張られていない＝保存を模擬してもアップロードは走らない。
    touch(2000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(uploadFileVersion).not.toHaveBeenCalled();
  });

  it('アップロード連続失敗は上限で監視を停止しエラー toast を出す', async () => {
    const { handle, touch } = makeHandle(1000);
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => handle);
    uploadFileVersion.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useFileLocalEdit());

    await act(async () => {
      await result.current.begin(TARGET);
    });
    touch(2000);
    // 失敗1〜3回目（3回目で打ち切り）。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(uploadFileVersion).toHaveBeenCalledTimes(3);
    // fil-0142: 連続失敗の上限到達時は stop() で idle に戻す代わりに paused 状態にする。
    // オーバーレイ側で停止理由＋「保存先を選び直す」ボタンが表示され、resume で復帰可能になる。
    expect(result.current.status).toBe('paused');
    expect(result.current.lastError).not.toBeNull();
    expect(toastError).toHaveBeenCalled();
  });

  it('paused 状態から resume を呼ぶと picker を出し直して監視を再開する（fil-0142）', async () => {
    const handleFactory = makeHandle(1000);
    const picker = vi.fn().mockResolvedValue(handleFactory.handle);
    (window as unknown as { showSaveFilePicker: typeof picker }).showSaveFilePicker = picker;
    (fetchFileBlob as Mock).mockResolvedValue(new Blob(['v1']));
    (uploadFileVersion as Mock)
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockRejectedValueOnce(new Error('fail-3'))
      .mockResolvedValueOnce({ versionNo: 2 });

    const { result } = renderHook(() => useFileLocalEdit({ onUploaded: vi.fn() }));

    await act(async () => {
      await result.current.begin(TARGET);
    });
    handleFactory.touch(2000);
    // 3 回失敗で paused へ遷移。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.status).toBe('paused');
    expect(picker).toHaveBeenCalledTimes(1);

    // resume を呼ぶと picker を出し直して watching へ戻る。既存 handle は破棄され timer 再開。
    await act(async () => {
      await result.current.resume();
    });
    expect(picker).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('watching');
    expect(result.current.lastError).toBeNull();
  });

  it('paused 以外で resume を呼ぶと error を返す（fil-0142・defensive）', async () => {
    const { result } = renderHook(() => useFileLocalEdit({ onUploaded: vi.fn() }));
    // idle 状態で resume
    expect(await result.current.resume()).toBe('error');
  });

  // fil-0083: lastLocalModified が UI 露出用 state として公開されていることを担保する。
  // begin 直後は getFile の lastModified で初期化、tick で更新、stop で null リセット。
  it('lastLocalModified: begin 初期化→tick 更新→stop で null リセット', async () => {
    const { handle, touch } = makeHandle(1000);
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => handle);
    uploadFileVersion.mockResolvedValue({ versionNo: 4 });
    const { result } = renderHook(() => useFileLocalEdit());

    // idle 状態では null
    expect(result.current.lastLocalModified).toBeNull();

    await act(async () => {
      await result.current.begin(TARGET);
    });
    // begin 完了直後は初回 getFile の lastModified（1000）が state に反映
    expect(result.current.lastLocalModified).toBe(1000);

    // ローカル更新を模擬 → 次の tick で state も 2000 に進む
    touch(2000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.lastLocalModified).toBe(2000);

    // stop で null リセット
    act(() => {
      result.current.stop();
    });
    expect(result.current.lastLocalModified).toBeNull();
  });
});
