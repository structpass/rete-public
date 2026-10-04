import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// createAttachment と toast をモックして deferred-flush の保留→一括添付フローを検証する。
// cmn-0146: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { createAttachment, toastError } = vi.hoisted(() => ({
  createAttachment: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  createAttachment: (...a: unknown[]) => createAttachment(...a),
}));
vi.mock('react-hot-toast', () => ({ default: { error: (...a: unknown[]) => toastError(...a) } }));

import { usePendingAttachments } from '../hooks/use-pending-attachments';

beforeEach(() => {
  createAttachment.mockReset();
  toastError.mockReset();
});

describe('usePendingAttachments — 保留操作', () => {
  it('add で保留に積み、count に反映すること', () => {
    const { result } = renderHook(() => usePendingAttachments());
    act(() => result.current.add('f-1', 'a.pdf'));
    // source 省略時は 'local'（ローカル取り込み）を既定とする（rete-desk-0108）。
    expect(result.current.pending).toEqual([{ fileId: 'f-1', fileName: 'a.pdf', source: 'local' }]);
    expect(result.current.count).toBe(1);
  });

  it('同一 fileId の二重 add は無視すること', () => {
    const { result } = renderHook(() => usePendingAttachments());
    act(() => result.current.add('f-1', 'a.pdf'));
    act(() => result.current.add('f-1', 'a.pdf'));
    expect(result.current.pending).toHaveLength(1);
  });

  it('remove で保留から取り除くこと', () => {
    const { result } = renderHook(() => usePendingAttachments());
    act(() => {
      result.current.add('f-1', 'a.pdf');
      result.current.add('f-2', 'b.pdf');
    });
    act(() => result.current.remove('f-1'));
    expect(result.current.pending.map((p) => p.fileId)).toEqual(['f-2']);
  });

  it('clear で全消去すること', () => {
    const { result } = renderHook(() => usePendingAttachments());
    act(() => result.current.add('f-1', 'a.pdf'));
    act(() => result.current.clear());
    expect(result.current.pending).toHaveLength(0);
  });
});

describe('usePendingAttachments — flush', () => {
  it('保留が空なら createAttachment を呼ばないこと', async () => {
    const { result } = renderHook(() => usePendingAttachments());
    await act(async () => {
      await result.current.flush('theme', 't-1');
    });
    expect(createAttachment).not.toHaveBeenCalled();
  });

  it('確定 id へ保留分を一括添付し、完了後ローカルを空にすること', async () => {
    createAttachment.mockResolvedValue({});
    const { result } = renderHook(() => usePendingAttachments());
    act(() => {
      result.current.add('f-1', 'a.pdf');
      result.current.add('f-2', 'b.pdf');
    });

    await act(async () => {
      await result.current.flush('theme', 't-9');
    });

    expect(createAttachment).toHaveBeenCalledTimes(2);
    expect(createAttachment).toHaveBeenNthCalledWith(1, {
      targetType: 'theme',
      targetId: 't-9',
      fileId: 'f-1',
    });
    expect(createAttachment).toHaveBeenNthCalledWith(2, {
      targetType: 'theme',
      targetId: 't-9',
      fileId: 'f-2',
    });
    expect(result.current.pending).toHaveLength(0);
  });

  it('一部失敗しても残りを続行し、失敗は toast で投影しつつ最後に空にすること', async () => {
    createAttachment.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});
    const { result } = renderHook(() => usePendingAttachments());
    act(() => {
      result.current.add('f-1', 'a.pdf');
      result.current.add('f-2', 'b.pdf');
    });

    await act(async () => {
      await result.current.flush('chatMessage', 'm-1');
    });

    expect(createAttachment).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledWith('「a.pdf」の添付に失敗しました');
    expect(result.current.pending).toHaveLength(0);
  });
});
