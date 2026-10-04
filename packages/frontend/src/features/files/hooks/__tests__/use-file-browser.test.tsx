import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ツリー取得 / フォルダ内容取得をモックし、初回選択フォルダの決定（initialFolderId 優先 → 先頭フォールバック）と
// 器（spaceId）スコープの取得・切替追従（fil-0137）を検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchFileTree, fetchFolderContent } = vi.hoisted(() => ({
  fetchFileTree: vi.fn(),
  fetchFolderContent: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchFileTree: (...a: unknown[]) => fetchFileTree(...a),
  fetchFolderContent: (...a: unknown[]) => fetchFolderContent(...a),
  moveFile: vi.fn(),
  moveFolder: vi.fn(),
}));

import { useFileBrowser } from '../use-file-browser';

const SPACE = 'space-1';

const TREE = [
  { fid: 'root', level: 0, name: 'ルート' },
  { fid: 'sub', level: 1, name: '受入オペレーション' },
];

beforeEach(() => {
  fetchFileTree.mockReset();
  fetchFolderContent.mockReset();
  fetchFileTree.mockResolvedValue(TREE);
  fetchFolderContent.mockImplementation((fid: string) =>
    Promise.resolve({ name: fid, crumb: [{ id: fid, name: fid }], items: [] }),
  );
});

describe('useFileBrowser — 初回選択フォルダ', () => {
  it('initialFolderId 未指定なら先頭フォルダを選択する（従来挙動）', async () => {
    const { result } = renderHook(() => useFileBrowser(SPACE));
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));
    expect(fetchFileTree).toHaveBeenCalledWith(SPACE);
    expect(fetchFolderContent).toHaveBeenCalledWith('root');
  });

  it('initialFolderId がツリーに存在すれば、先頭でなくその精密フォルダを初回選択する（HM-1-4 deep link）', async () => {
    const { result } = renderHook(() => useFileBrowser(SPACE, 'sub'));
    await waitFor(() => expect(result.current.currentFolderId).toBe('sub'));
    expect(fetchFolderContent).toHaveBeenCalledWith('sub');
  });

  it('initialFolderId がツリーに無ければ先頭フォルダへフォールバックする', async () => {
    const { result } = renderHook(() => useFileBrowser(SPACE, 'missing'));
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));
    expect(fetchFolderContent).toHaveBeenCalledWith('root');
  });

  it('マウント後に initialFolderId が変わったら（同一ルートでの deep link 切替）その精密フォルダへ追従する', async () => {
    const { result, rerender } = renderHook(({ id }) => useFileBrowser(SPACE, id), {
      initialProps: { id: 'root' as string | null },
    });
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));

    rerender({ id: 'sub' });
    await waitFor(() => expect(result.current.currentFolderId).toBe('sub'));
    expect(fetchFolderContent).toHaveBeenCalledWith('sub');
  });

  it('deep link 適用後にツリーで別フォルダを選んでも initialFolderId へ引き戻さない（hom-0115）', async () => {
    const { result } = renderHook(() => useFileBrowser(SPACE, 'sub'));
    await waitFor(() => expect(result.current.currentFolderId).toBe('sub'));
    const callsBefore = fetchFolderContent.mock.calls.length;

    // ツリークリック相当: selectFolder('root')
    act(() => {
      result.current.selectFolder('root');
    });
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));

    // 引き戻しが走ると currentFolderId が sub に戻り、fetchFolderContent('sub') が再度呼ばれる。
    // 少し待っても root のまま・sub への追加ロードが無いこと。
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.currentFolderId).toBe('root');
    const subCallsAfter = fetchFolderContent.mock.calls.filter((c) => c[0] === 'sub').length;
    const subCallsBefore = fetchFolderContent.mock.calls
      .slice(0, callsBefore)
      .filter((c) => c[0] === 'sub').length;
    expect(subCallsAfter).toBe(subCallsBefore);
  });
});

describe('useFileBrowser — 器（spaceId）スコープ（fil-0137）', () => {
  it('spaceId=null（復元待ち）の間はツリーを取得せず treeLoading のまま', async () => {
    const { result } = renderHook(() => useFileBrowser(null));
    // 少し待っても fetch は走らない（hydrated 前の二重 fetch 防止）。
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchFileTree).not.toHaveBeenCalled();
    expect(result.current.treeLoading).toBe(true);
  });

  it('spaceId が確定したらその器のツリーを取得する（null → 値）', async () => {
    const { result, rerender } = renderHook(({ sid }) => useFileBrowser(sid), {
      initialProps: { sid: null as string | null },
    });
    rerender({ sid: SPACE });
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));
    expect(fetchFileTree).toHaveBeenCalledWith(SPACE);
  });

  it('channel 切替（spaceId 変更）で選択をリセットし新しい器のツリーへ追従する', async () => {
    const OTHER_TREE = [{ fid: 'other-root', level: 0, name: '別チャネルのルート' }];
    const { result, rerender } = renderHook(({ sid }) => useFileBrowser(sid), {
      initialProps: { sid: SPACE as string | null },
    });
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));

    fetchFileTree.mockResolvedValue(OTHER_TREE);
    rerender({ sid: 'space-2' });
    await waitFor(() => expect(result.current.currentFolderId).toBe('other-root'));
    expect(fetchFileTree).toHaveBeenLastCalledWith('space-2');
    expect(result.current.currentTree).toEqual(OTHER_TREE);
    expect(fetchFolderContent).toHaveBeenCalledWith('other-root');
  });

  it('channel 切替時に旧器で in-flight のフォルダ応答が後着しても捨てる（復活防止）', async () => {
    // 旧器（space-1）の root 内容取得を保留させ、切替完了後に resolve して後着を再現する。
    let resolveStale!: (v: unknown) => void;
    fetchFolderContent.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveStale = r;
        }),
    );
    const OTHER_TREE = [{ fid: 'other-root', level: 0, name: '別チャネルのルート' }];
    const { result, rerender } = renderHook(({ sid }) => useFileBrowser(sid), {
      initialProps: { sid: SPACE as string | null },
    });
    await waitFor(() => expect(result.current.currentFolderId).toBe('root'));

    fetchFileTree.mockResolvedValue(OTHER_TREE);
    rerender({ sid: 'space-2' });
    await waitFor(() => expect(result.current.currentFolder?.name).toBe('other-root'));

    // 旧器の応答がいま着弾しても、切替時の連番送りで無効化済み＝新器の内容を上書きしない。
    await act(async () => {
      resolveStale({ name: 'stale-root', crumb: [], items: [] });
    });
    expect(result.current.currentFolder?.name).toBe('other-root');
  });

  it('tree 取得が 404 で失敗したら treeErrorStatus に status を保持する（非可視 space 判定・fil-0138）', async () => {
    fetchFileTree.mockRejectedValue({ response: { status: 404 } });
    const { result } = renderHook(() => useFileBrowser(SPACE));
    await waitFor(() => expect(result.current.treeError).toBe(true));
    expect(result.current.treeErrorStatus).toBe(404);
  });
});
