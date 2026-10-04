import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// 添付 API ラッパと toast をモックして、保留（deferred）方式の add/remove/commit/discard を検証する
// （use-desk-attachments.test と同じモック方針）。
// cmn-0146: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchAttachments, createAttachment, deleteAttachment, toastError } = vi.hoisted(() => ({
  fetchAttachments: vi.fn(),
  createAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAttachments: (...a: unknown[]) => fetchAttachments(...a),
  createAttachment: (...a: unknown[]) => createAttachment(...a),
  deleteAttachment: (...a: unknown[]) => deleteAttachment(...a),
}));
vi.mock('react-hot-toast', () => ({ default: { error: (...a: unknown[]) => toastError(...a) } }));

import { useDeferredAttachments } from '../hooks/use-deferred-attachments';

const att = (id: string) => ({
  id,
  fileId: `f-${id}`,
  fileName: `${id}.pdf`,
  versionNo: 1,
  byteSize: 10,
  mimeType: 'application/pdf',
  attachedBy: '山田',
  createdAt: '2026-06-01T00:00:00.000Z',
});

/** axios 形のエラー（status 判定用）。hook は isAxiosError + response.status で 409/404 を許容する。 */
const axiosError = (status: number) =>
  Object.assign(new Error(`http ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });

beforeEach(() => {
  fetchAttachments.mockReset();
  createAttachment.mockReset();
  deleteAttachment.mockReset();
  toastError.mockReset();
});

describe('useDeferredAttachments — 取得（base 透過）', () => {
  it('マウント時に fetchAttachments を呼び、確定一覧をそのまま返すこと', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchAttachments).toHaveBeenCalledWith('chatMessage', 'm1');
    expect(result.current.attachments.map((x) => x.id)).toEqual(['a']);
    expect(result.current.dirty).toBe(false);
  });
});

describe('useDeferredAttachments — add（ローカルのみ・サーバ未通信）', () => {
  it('add は createAttachment を呼ばず、保留チップ（versionNo:0）を合成一覧へ足すこと', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.add('f-x', '追加分.xlsx');
    });

    expect(ok).toBe(true);
    expect(createAttachment).not.toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(2);
    const pending = result.current.attachments[1];
    expect(pending.fileId).toBe('f-x');
    expect(pending.fileName).toBe('追加分.xlsx');
    expect(pending.versionNo).toBe(0);
    expect(result.current.dirty).toBe(true);
  });

  it('確定済みと同一 fileId の add は何もせず true（重複保留を作らない）', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-a', 'a.pdf');
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.dirty).toBe(false);
  });

  it('解除保留中の確定添付を再 add すると解除保留が取り消されること', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('a');
    });
    expect(result.current.attachments).toHaveLength(0);

    await act(async () => {
      await result.current.add('f-a', 'a.pdf');
    });
    expect(result.current.attachments.map((x) => x.id)).toEqual(['a']);
    expect(result.current.dirty).toBe(false);
  });
});

describe('useDeferredAttachments — remove（ローカルのみ・サーバ未通信）', () => {
  it('確定添付の remove は deleteAttachment を呼ばず合成一覧から隠すこと', async () => {
    fetchAttachments.mockResolvedValue([att('a'), att('b')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('a');
    });

    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(result.current.attachments.map((x) => x.id)).toEqual(['b']);
    expect(result.current.dirty).toBe(true);
  });

  it('保留追加の remove は保留から取り下げるだけ（dirty も解消）', async () => {
    fetchAttachments.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-x', 'x.pdf');
    });
    const pendingId = result.current.attachments[0].id;
    await act(async () => {
      await result.current.remove(pendingId);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.dirty).toBe(false);
  });
});

describe('useDeferredAttachments — commit（保存時の一括確定）', () => {
  it('成功時: 追加分 create + 解除分 delete → 再取得 → 保留クリアで true', async () => {
    fetchAttachments.mockResolvedValueOnce([att('a')]).mockResolvedValueOnce([att('x')]);
    createAttachment.mockResolvedValue(att('x'));
    deleteAttachment.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-x', 'x.pdf');
      await result.current.remove('a');
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(true);
    expect(createAttachment).toHaveBeenCalledWith({
      targetType: 'chatMessage',
      targetId: 'm1',
      fileId: 'f-x',
    });
    expect(deleteAttachment).toHaveBeenCalledWith('a');
    expect(fetchAttachments).toHaveBeenCalledTimes(2);
    expect(result.current.dirty).toBe(false);
    expect(result.current.attachments.map((x) => x.id)).toEqual(['x']);
  });

  it('一部失敗時: 全体を失敗扱い（false）とし、保留を保持して再試行に備えること', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    createAttachment.mockRejectedValue(new Error('boom'));
    deleteAttachment.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-x', 'x.pdf');
      await result.current.remove('a');
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledWith('「x.pdf」の添付に失敗しました');
    // 解除分は独立に実行される（失敗した追加分だけが再試行対象として残る前提の best-effort）。
    expect(deleteAttachment).toHaveBeenCalledWith('a');
    expect(result.current.dirty).toBe(true);
  });

  it('再試行の冪等性: create の 409（既に添付済み）/ delete の 404（既に解除済み）は成功扱い', async () => {
    fetchAttachments.mockResolvedValueOnce([att('a')]).mockResolvedValueOnce([att('x')]);
    createAttachment.mockRejectedValue(axiosError(409));
    deleteAttachment.mockRejectedValue(axiosError(404));
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-x', 'x.pdf');
      await result.current.remove('a');
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.dirty).toBe(false);
  });

  it('保留が無い commit は API を呼ばず true（再取得もしない）', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.commit();
    });

    expect(ok).toBe(true);
    expect(createAttachment).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(fetchAttachments).toHaveBeenCalledTimes(1);
  });
});

describe('useDeferredAttachments — discard / 対象切替', () => {
  it('discard は API を呼ばず保留（追加・解除）を破棄し、開始時点の一覧へ戻すこと', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() =>
      useDeferredAttachments({ targetType: 'chatMessage', targetId: 'm1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-x', 'x.pdf');
      await result.current.remove('a');
    });
    act(() => {
      result.current.discard();
    });

    expect(createAttachment).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(result.current.attachments.map((x) => x.id)).toEqual(['a']);
    expect(result.current.dirty).toBe(false);
  });

  it('対象（targetId）が変わったら保留をクリアすること（別メッセージへ持ち越さない）', async () => {
    fetchAttachments.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ targetId }: { targetId: string }) =>
        useDeferredAttachments({ targetType: 'chatMessage', targetId }),
      { initialProps: { targetId: 'm1' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add('f-x', 'x.pdf');
    });
    expect(result.current.dirty).toBe(true);

    rerender({ targetId: 'm2' });
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(result.current.attachments).toHaveLength(0);
  });
});
