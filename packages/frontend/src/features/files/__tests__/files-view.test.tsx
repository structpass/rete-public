import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UseFileBrowserResult } from '../hooks/use-file-browser';

// FilesView の器スコープ解決とフォールバック（fil-0137/fil-0138）を検証する。
// 描画の中身（shell / sidebar）は関心外なのでスタブ化し、useFileBrowser へ渡る spaceId と
// 「保存 space が非可視（tree 404）→ 選択解除で既定チャネルへ」の effect だけを観測する。
const { useFileBrowserMock, setSelectedSpaceId, deskSpaceState } = vi.hoisted(() => ({
  useFileBrowserMock: vi.fn(),
  setSelectedSpaceId: vi.fn(),
  deskSpaceState: {
    selectedSpaceId: null as string | null,
    hydrated: true,
  },
}));

vi.mock('../components/files-shell', () => ({ FilesShell: () => null }));
vi.mock('../components/files-sidebar', () => ({ FilesSidebar: () => null }));
vi.mock('@/features/shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../hooks/use-file-edit-link', () => ({ useFileEditLink: vi.fn() }));
vi.mock('../hooks/use-file-overlays', () => ({
  useFileOverlays: () => ({ openSettings: vi.fn(), openTagMaster: vi.fn() }),
}));
vi.mock('@/features/desk/hooks/desk-space-context', () => ({
  DeskSpaceProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useDeskSpace: () => ({
    selectedSpaceId: deskSpaceState.selectedSpaceId,
    setSelectedSpaceId,
    hydrated: deskSpaceState.hydrated,
  }),
}));
vi.mock('../hooks/use-file-browser', () => ({
  useFileBrowser: (...a: unknown[]) => useFileBrowserMock(...a) as UseFileBrowserResult,
}));

import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { FilesView } from '../components/files-view';

const SAVED_SPACE = '11111111-1111-4111-b111-111111111111';

function browserStub(over: Partial<UseFileBrowserResult> = {}): UseFileBrowserResult {
  return {
    spaceId: null,
    currentFolderId: null,
    currentTree: [],
    currentFolder: null,
    treeLoading: false,
    treeError: false,
    treeErrorStatus: null,
    folderLoading: false,
    folderError: false,
    dndDisabled: false,
    selectFolder: vi.fn(),
    refreshFolder: vi.fn(),
    moveFolderTo: vi.fn(),
    moveFileTo: vi.fn(),
    reloadAll: vi.fn(),
    ...over,
  };
}

function renderView() {
  return render(<FilesView initialFolderId={null} initialFileId={null} />);
}

beforeEach(() => {
  useFileBrowserMock.mockReset().mockReturnValue(browserStub());
  setSelectedSpaceId.mockReset();
  deskSpaceState.selectedSpaceId = null;
  deskSpaceState.hydrated = true;
});

describe('FilesView — 器スコープの解決（fil-0137/fil-0138）', () => {
  it('復元待ち（hydrated=false）の間は spaceId=null で fetch を始めさせない', () => {
    deskSpaceState.hydrated = false;
    renderView();
    expect(useFileBrowserMock).toHaveBeenCalledWith(null, null);
  });

  it('未選択（Desk 未訪問）は既定チャネルで開く', () => {
    renderView();
    expect(useFileBrowserMock).toHaveBeenCalledWith(DEFAULT_CHANNEL_ID, null);
  });

  it('Desk で選択済みの器（localStorage 復元値）をそのまま引き継ぐ', () => {
    deskSpaceState.selectedSpaceId = SAVED_SPACE;
    renderView();
    expect(useFileBrowserMock).toHaveBeenCalledWith(SAVED_SPACE, null);
  });
});

describe('FilesView — 非可視/削除済み space のフォールバック（fil-0138）', () => {
  it('保存 space の tree が 404 なら選択を解除して既定チャネルで開き直す（エラーにしない）', () => {
    deskSpaceState.selectedSpaceId = SAVED_SPACE;
    useFileBrowserMock.mockReturnValue(browserStub({ treeError: true, treeErrorStatus: 404 }));
    renderView();
    expect(setSelectedSpaceId).toHaveBeenCalledWith(null);
  });

  it('404 以外（5xx 等の一過性エラー）では選択を解除しない', () => {
    deskSpaceState.selectedSpaceId = SAVED_SPACE;
    useFileBrowserMock.mockReturnValue(browserStub({ treeError: true, treeErrorStatus: 500 }));
    renderView();
    expect(setSelectedSpaceId).not.toHaveBeenCalled();
  });

  it('未選択（既定チャネル）で 404 の場合はフォールバック先が無いので解除しない', () => {
    useFileBrowserMock.mockReturnValue(browserStub({ treeError: true, treeErrorStatus: 404 }));
    renderView();
    expect(setSelectedSpaceId).not.toHaveBeenCalled();
  });

  it('同一マウント中に 404 が続いても解除は 1 回だけ（fellBackRef ガード・ループ防止）', () => {
    deskSpaceState.selectedSpaceId = SAVED_SPACE;
    useFileBrowserMock.mockReturnValue(browserStub({ treeError: true, treeErrorStatus: 404 }));
    const { rerender } = renderView();
    expect(setSelectedSpaceId).toHaveBeenCalledTimes(1);
    // mock は selectedSpaceId を SAVED_SPACE のまま返し続ける＝ガードが無ければ再描画で再発火する。
    rerender(<FilesView initialFolderId={null} initialFileId={null} />);
    expect(setSelectedSpaceId).toHaveBeenCalledTimes(1);
  });
});
