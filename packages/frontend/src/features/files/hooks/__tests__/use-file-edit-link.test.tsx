import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// メタ取得 API・toast をモックし、deep link（fileId）→ フォルダ遷移 + 編集オーバーレイ起動を検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
// 旧 level（VIEW）による openEdit 抑止は ADR 0063（fil-0139）で撤廃＝可視 space なら常に編集可。
const { fetchFileMeta, toastError } = vi.hoisted(() => ({
  fetchFileMeta: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchFileMeta: (...a: unknown[]) => fetchFileMeta(...a),
}));
vi.mock('react-hot-toast', () => ({
  default: { error: (...a: unknown[]) => toastError(...a) },
}));

import { useFileEditLink } from '../use-file-edit-link';

beforeEach(() => {
  fetchFileMeta.mockReset();
  toastError.mockReset();
});

describe('useFileEditLink', () => {
  it('fileId=null では何もしない（メタ取得を呼ばない）', () => {
    const selectFolder = vi.fn();
    const openEdit = vi.fn();
    renderHook(() => useFileEditLink(null, selectFolder, openEdit));
    expect(fetchFileMeta).not.toHaveBeenCalled();
    expect(openEdit).not.toHaveBeenCalled();
  });

  it('fileId が来たらメタ解決 → 所属フォルダ遷移 → 編集オーバーレイ起動する', async () => {
    fetchFileMeta.mockResolvedValue({
      id: 'file-9',
      name: 'report.docx',
      folderId: 'folder-3',
      versionNo: 2,
    });
    const selectFolder = vi.fn();
    const openEdit = vi.fn();
    renderHook(() => useFileEditLink('file-9', selectFolder, openEdit));

    await waitFor(() => expect(openEdit).toHaveBeenCalled());
    expect(fetchFileMeta).toHaveBeenCalledWith('file-9');
    expect(selectFolder).toHaveBeenCalledWith('folder-3');
    expect(openEdit).toHaveBeenCalledWith({ id: 'file-9', name: 'report.docx', versionNo: 2 });
  });

  it('同一 fileId の再レンダーでは二重に解決しない（ref で抑止）', async () => {
    fetchFileMeta.mockResolvedValue({ id: 'file-9', name: 'a', folderId: 'f', versionNo: 1 });
    const selectFolder = vi.fn();
    const openEdit = vi.fn();
    const { rerender } = renderHook(() => useFileEditLink('file-9', selectFolder, openEdit));
    await waitFor(() => expect(openEdit).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(fetchFileMeta).toHaveBeenCalledTimes(1);
  });

  it('メタ取得失敗時は toast.error を出しオーバーレイを開かない', async () => {
    fetchFileMeta.mockRejectedValue(new Error('not found'));
    const selectFolder = vi.fn();
    const openEdit = vi.fn();
    renderHook(() => useFileEditLink('file-x', selectFolder, openEdit));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(openEdit).not.toHaveBeenCalled();
  });
});
