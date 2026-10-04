import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { flush } from '@/test-utils/flush';
import type { FolderContent, TreeNode } from '@/features/files/lib/types';

// マウント時の files API 解決（tree→folder）を待って post-mount setState を act 内で消化する。

// useFileBrowser はマウント時に files API を引くためモックする。ピッカーは
// [ファイル] タブで tree+一覧を描画し、行クリックで onPick へ橋渡しする配線を検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchFileTree, fetchFolderContent, uploadFile } = vi.hoisted(() => ({
  fetchFileTree: vi.fn(),
  fetchFolderContent: vi.fn(),
  uploadFile: vi.fn(),
}));
vi.mock('@/features/files/lib/api', () => ({
  fetchFileTree: () => fetchFileTree(),
  fetchFolderContent: (id: string) => fetchFolderContent(id),
  uploadFile: (folderId: string, file: File) => uploadFile(folderId, file),
  // useFileBrowser の move 系は本テストで未使用だが import 解決のため空実装を置く。
  moveFile: vi.fn(),
  moveFolder: vi.fn(),
}));
// cmn-0420: FileList が使う列幅永続化（user-table-column-widths）もモック。未モックだと mount 時の
// 取得が実 XHR で backend へ飛んでいた（file-list-dblclick.test と同型のモック）。
vi.mock('@/features/user-table-column-widths', () => ({
  useTableColumnWidths: () => ({
    widths: {},
    setWidth: vi.fn(),
    resetWidths: vi.fn(),
  }),
}));

import { FilePickerOverlay } from '../components/file-picker-overlay';

const tree: TreeNode[] = [{ fid: 'f1', level: 0, name: '在庫' }];
const folder: FolderContent = {
  name: '在庫',
  crumb: [{ id: 'f1', name: '在庫' }],
  items: [
    {
      kind: 'file',
      id: 'file1',
      name: '入荷検品.md',
      updatedBy: '田中',
      updatedAt: '2026-06-01',
      size: '12 KB',
    },
  ],
};

beforeEach(() => {
  fetchFileTree.mockResolvedValue(tree);
  fetchFolderContent.mockResolvedValue(folder);
});

afterEach(() => {
  cleanup();
  fetchFileTree.mockReset();
  fetchFolderContent.mockReset();
  uploadFile.mockReset();
});

describe('FilePickerOverlay（2 タブ・rete-desk-0077/0078 / 0096-0100）', () => {
  it('ローカル / ファイルの 2 タブを描画し、タイトルラベルは出さない', async () => {
    render(<FilePickerOverlay onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'ローカル' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ファイル' })).toBeInTheDocument();
    // 旧タイトル「ファイルを添付」の見出しは廃止（aria-label には残るが h2 見出しは無い）。
    expect(screen.queryByRole('heading', { name: 'ファイルを添付' })).toBeNull();
    await flush();
  });

  it('[ファイル] タブでファイル行をクリックすると onPick へ橋渡しする', async () => {
    const onPick = vi.fn();
    render(<FilePickerOverlay onPick={onPick} onClose={vi.fn()} />);
    // tree → folder ロード完了でファイル行が出る。
    const fileCell = await screen.findByText('入荷検品.md');
    fireEvent.click(fileCell);
    // [ファイル] タブ選択は出所 'repo'（リンク）として onPick へ渡る（rete-desk-0108）。
    expect(onPick).toHaveBeenCalledWith('file1', '入荷検品.md', 'repo');
  });

  it('[ファイル] タブは版数/更新者/選択チェック/フッタ/戻る進むを出さない（rete-desk-0096-0100）', async () => {
    render(<FilePickerOverlay onPick={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText('入荷検品.md'); // 一覧ロード完了を待つ
    expect(screen.queryByText('版数')).toBeNull(); // 0096
    expect(screen.queryByText('更新者')).toBeNull(); // 0098
    expect(screen.queryByLabelText('すべて選択')).toBeNull(); // 0097 空白チェック列
    expect(screen.queryByText(/件選択中/)).toBeNull(); // 0100 フッタ
    expect(screen.queryByLabelText('戻る')).toBeNull(); // 0099
    expect(screen.queryByLabelText('進む')).toBeNull(); // 0099
    // 残す列（名前/種類/更新日/サイズ）は描画される。
    expect(screen.getByText('名前')).toBeInTheDocument();
    expect(screen.getByText('種類')).toBeInTheDocument();
    expect(screen.getByText('更新日')).toBeInTheDocument();
    expect(screen.getByText('サイズ')).toBeInTheDocument();
  });

  it('[ローカル] タブへ切り替えると取り込みゾーンを表示する', async () => {
    render(<FilePickerOverlay onPick={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'ローカル' }));
    expect(screen.getByText('ローカルからファイルを選択')).toBeInTheDocument();
    await flush();
  });
});
