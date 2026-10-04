import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagSearchResults } from '../components/tag-search-results';
import { SearchResults } from '../components/search-results';
import type { SearchResultItem, TreeNode } from '../lib/types';

/**
 * fil-0046: タグ絞込結果のフォルダ行ダブルクリックで open+フィルタ解除。
 * - 単クリック従来挙動（onNavigate）は維持。
 * - ダブルクリックはフォルダ行のみ onOpenFolder を発火（ファイル行は無し）。
 *
 * 【真因対応・回帰防止】ダブルクリックは native onDoubleClick ではなく「閾値内の 2 回目クリック」を
 * 手動検出する実装に変えた（1 クリック目の onNavigate→selectFolder の再レンダーで native dblclick が
 * 発火しない実機バグ＝合成 dblclick では再現しないが実マウスで再現した）。よって本テストは
 * fireEvent.dblClick（単発の合成 dblclick）ではなく、実機と同じ「click を 2 回」で検証する。
 */

const tree: TreeNode[] = [];

const folderResult: SearchResultItem = {
  kind: 'folder',
  id: 'fld-001',
  name: 'フォルダA',
  parentFolderId: null,
};

const fileResult: SearchResultItem = {
  kind: 'file',
  id: 'file-002',
  name: 'ファイルB.pdf',
  parentFolderId: 'fld-001',
};

function renderComp(
  results: SearchResultItem[],
  {
    onNavigate = vi.fn(),
    onOpenFolder,
  }: {
    onNavigate?: (id: string) => void;
    onOpenFolder?: (folderId: string) => void;
  } = {},
) {
  return render(
    <TagSearchResults
      results={results}
      tree={tree}
      loading={false}
      error={false}
      truncated={false}
      onNavigate={onNavigate}
      onOpenFolder={onOpenFolder}
    />,
  );
}

describe('TagSearchResults — dblclick (fil-0046)', () => {
  it('フォルダ行をシングルクリック（1 回）すると onNavigate が呼ばれ onOpenFolder は呼ばれない', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    renderComp([folderResult], { onNavigate, onOpenFolder });

    const row = screen.getByText('フォルダA').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(onNavigate).toHaveBeenCalledWith('fld-001');
    expect(onOpenFolder).not.toHaveBeenCalled();
  });

  it('フォルダ行を連続 2 回クリック（＝ダブルクリック）すると 2 回目で onOpenFolder が呼ばれる', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    renderComp([folderResult], { onNavigate, onOpenFolder });

    const row = screen.getByText('フォルダA').closest('tr');
    expect(row).not.toBeNull();
    // 実機と同じく click を 2 回（native dblclick には依存しない＝真因の回帰防止）。
    fireEvent.click(row!);
    fireEvent.click(row!);

    expect(onOpenFolder).toHaveBeenCalledWith('fld-001');
    // 1 クリック目は単クリックとしてナビゲートする（従来挙動の維持）。2 回目はダブルクリック判定で
    // 早期 return するため onNavigate は 1 回だけ（2 回目に navigate しないインバリアントの回帰）。
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('fld-001');
  });

  it('フォルダ→ファイル→同フォルダ の連打では onOpenFolder を呼ばない（誤検出の回帰防止・fil-0046 HIGH）', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    // 選択列ありモード（タグ検索の実構成）でフォルダ + ファイル混在を描画。
    const selection = { has: () => false, toggle: vi.fn(), setMany: vi.fn() };
    render(
      <TagSearchResults
        results={[folderResult, fileResult]}
        tree={tree}
        loading={false}
        error={false}
        truncated={false}
        onNavigate={onNavigate}
        onOpenFolder={onOpenFolder}
        selection={selection}
      />,
    );

    const folderRow = screen.getByText('フォルダA').closest('tr');
    const fileRow = screen.getByText('ファイルB.pdf').closest('tr');
    // フォルダ → ファイル → 同フォルダ を連続クリック。間にファイルが挟まると追跡がリセットされ、
    // 最後のフォルダクリックは「1 回目」扱い＝open されない。
    fireEvent.click(folderRow!);
    fireEvent.click(fileRow!);
    fireEvent.click(folderRow!);

    expect(onOpenFolder).not.toHaveBeenCalled();
  });

  it('合成 dblclick 単発では onOpenFolder を呼ばない（native onDoubleClick に依存しない実装の保証）', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    renderComp([folderResult], { onNavigate, onOpenFolder });

    const row = screen.getByText('フォルダA').closest('tr');
    // preceding click を伴わない単発 dblclick イベントは無視される（手動検出は click 2 回で発火）。
    fireEvent.dblClick(row!);

    expect(onOpenFolder).not.toHaveBeenCalled();
  });

  it('ファイル行を 2 回クリックしても onOpenFolder は呼ばれない', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    renderComp([fileResult], { onNavigate, onOpenFolder });

    const row = screen.getByText('ファイルB.pdf').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    fireEvent.click(row!);

    expect(onOpenFolder).not.toHaveBeenCalled();
  });

  it('onOpenFolder を渡さなくてもフォルダ行の 2 回クリックでエラーにならない', () => {
    const onNavigate = vi.fn();
    renderComp([folderResult], { onNavigate });

    const row = screen.getByText('フォルダA').closest('tr');
    expect(row).not.toBeNull();
    expect(() => {
      fireEvent.click(row!);
      fireEvent.click(row!);
    }).not.toThrow();
  });
});

/**
 * fil-0046 (b): キーワード検索結果（素の SearchResults）でも同じダブルクリック契約が成立する。
 * 旧実装では files-shell が <SearchResults>（キーワード経路）へ onOpenFolder を配線しておらず、
 * フォルダ行ダブルクリックが no-op だった（タグ経路だけ配線済みだった）。タグ経路と同一の
 * SearchResults を共用するため、キーワード経路でも onOpenFolder が発火する契約をここで固定する。
 */
describe('SearchResults — keyword-path dblclick (fil-0046 b)', () => {
  function renderKw(
    results: SearchResultItem[],
    onOpenFolder?: (folderId: string) => void,
    onNavigate = vi.fn(),
  ) {
    return render(
      <SearchResults
        results={results}
        tree={tree}
        loading={false}
        error={false}
        truncated={false}
        errorText="検索に失敗しました"
        emptyText="該当する項目がありません"
        onNavigate={onNavigate}
        onOpenFolder={onOpenFolder}
      />,
    );
  }

  it('キーワード結果のフォルダ行を 2 回クリックすると onOpenFolder が発火する', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    renderKw([folderResult], onOpenFolder, onNavigate);

    const row = screen.getByText('フォルダA').closest('tr');
    fireEvent.click(row!);
    fireEvent.click(row!);

    expect(onOpenFolder).toHaveBeenCalledWith('fld-001');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('キーワード結果のフォルダ行シングルクリックは onNavigate のみ（従来挙動の維持）', () => {
    const onNavigate = vi.fn();
    const onOpenFolder = vi.fn();
    renderKw([folderResult], onOpenFolder, onNavigate);

    const row = screen.getByText('フォルダA').closest('tr');
    fireEvent.click(row!);

    expect(onNavigate).toHaveBeenCalledWith('fld-001');
    expect(onOpenFolder).not.toHaveBeenCalled();
  });
});
