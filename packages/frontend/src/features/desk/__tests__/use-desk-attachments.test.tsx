import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// 添付 API ラッパと toast をモックして、フックの取得/追加/解除フローを検証する。
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

import { useDeskAttachments } from '../hooks/use-desk-attachments';

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

beforeEach(() => {
  fetchAttachments.mockReset();
  createAttachment.mockReset();
  deleteAttachment.mockReset();
  toastError.mockReset();
});

describe('useDeskAttachments — 取得', () => {
  it('マウント時に fetchAttachments を呼び、一覧をセットすること', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    const { result } = renderHook(() => useDeskAttachments({ targetType: 'task', targetId: 1 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchAttachments).toHaveBeenCalledWith('task', 1);
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('取得失敗時は error をセットする（toast は出さない＝インライン表示）', async () => {
    fetchAttachments.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDeskAttachments({ targetType: 'task', targetId: 1 }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('添付の取得に失敗しました');
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('useDeskAttachments — 追加', () => {
  it('成功時: createAttachment を呼び再取得し true を返すこと', async () => {
    fetchAttachments.mockResolvedValueOnce([]).mockResolvedValueOnce([att('a')]);
    createAttachment.mockResolvedValue(att('a'));
    const { result } = renderHook(() => useDeskAttachments({ targetType: 'task', targetId: 1 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.add('f-a');
    });

    expect(createAttachment).toHaveBeenCalledWith({
      targetType: 'task',
      targetId: 1,
      fileId: 'f-a',
    });
    expect(ok).toBe(true);
    expect(result.current.attachments).toHaveLength(1);
  });

  it('失敗時: toast を出し false を返すこと', async () => {
    fetchAttachments.mockResolvedValue([]);
    createAttachment.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDeskAttachments({ targetType: 'task', targetId: 1 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.add('f-a');
    });

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledWith('添付の追加に失敗しました');
  });
});

describe('useDeskAttachments — 解除', () => {
  it('成功時: 楽観的にローカル配列から除去すること（再取得しない）', async () => {
    fetchAttachments.mockResolvedValue([att('a'), att('b')]);
    deleteAttachment.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeskAttachments({ targetType: 'task', targetId: 1 }));
    await waitFor(() => expect(result.current.attachments).toHaveLength(2));

    await act(async () => {
      await result.current.remove('a');
    });

    expect(deleteAttachment).toHaveBeenCalledWith('a');
    expect(result.current.attachments.map((x) => x.id)).toEqual(['b']);
    expect(fetchAttachments).toHaveBeenCalledTimes(1);
  });

  it('失敗時: toast を出し、配列を変えないこと', async () => {
    fetchAttachments.mockResolvedValue([att('a')]);
    deleteAttachment.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDeskAttachments({ targetType: 'task', targetId: 1 }));
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));

    await act(async () => {
      await result.current.remove('a');
    });

    expect(toastError).toHaveBeenCalledWith('添付の解除に失敗しました');
    expect(result.current.attachments).toHaveLength(1);
  });
});
