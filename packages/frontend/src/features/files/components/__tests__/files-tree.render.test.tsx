import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { FilesTree } from '../files-tree';
import type { FolderDraft } from '../../hooks/use-folder-create';
import type { SearchResultItem, TreeNode } from '../../lib/types';

// useDraggable / useDroppable は DndContext 配下を要求する（@dnd-kit/core）。
const withDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>);

// a(0) > b(1) > c(2), a > d(1), e(0)
const tree: TreeNode[] = [
  { fid: 'a', level: 0, name: 'A' },
  { fid: 'b', level: 1, name: 'B' },
  { fid: 'c', level: 2, name: 'C' },
  { fid: 'd', level: 1, name: 'D' },
  { fid: 'e', level: 0, name: 'E' },
];

const draft: FolderDraft = { parentFolderId: 'a', name: '新規' };
const noopDropProps = {
  onDragEnter: () => {},
  onDragOver: () => {},
  onDragLeave: () => {},
  onDrop: () => {},
};

describe('FilesTree（本体描画 / fil-0123）', () => {
  it('行クリックで onSelect が当該フォルダ id で呼ばれ、シェブロンクリックでは呼ばれない', () => {
    const onSelect = vi.fn();
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={onSelect}
        collapsedIds={new Set()}
        onToggleCollapse={() => {}}
      />,
    );
    // 行本体クリック → onSelect(fid)
    fireEvent.click(screen.getByText('B'));
    expect(onSelect).toHaveBeenCalledWith('b');
    // シェブロンクリック → 開閉に分離され onSelect は呼ばれない（fil-0072）
    const aRow = screen.getByText('A').closest('.ftree-node')!;
    fireEvent.click(aRow.querySelector('.ftree-chev')!);
    expect(onSelect).toHaveBeenCalledTimes(1); // シェブロンクリックで選択遷移が増えない
  });

  it('ツリー配列が階層（level）どおり描画され、子持ちにだけシェブロンが付く', () => {
    withDnd(<FilesTree tree={tree} currentFolderId={null} dndDisabled onSelect={() => {}} />);
    const rowLevels = Array.from(document.querySelectorAll('.ftree-node')).map((el) =>
      (el as HTMLElement).style.getPropertyValue('--lvl'),
    );
    expect(rowLevels).toEqual(['0', '1', '2', '1', '0']);
    // 子持ち a / b にはシェブロン SVG、葉 c / d / e には付かない（fil-0086）
    const chevOf = (name: string) =>
      screen.getByText(name).closest('.ftree-node')!.querySelector('.ftree-chev')!;
    expect(chevOf('A').querySelector('svg')).toBeTruthy();
    expect(chevOf('B').querySelector('svg')).toBeTruthy();
    expect(chevOf('C').querySelector('svg')).toBeNull();
    expect(chevOf('D').querySelector('svg')).toBeNull();
    expect(chevOf('E').querySelector('svg')).toBeNull();
  });

  it('ルート直下の下書き行はツリー先頭に差し込まれる', () => {
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        draft={{ parentFolderId: null, name: '新規' }}
        onDraftChange={() => {}}
        onDraftCommit={() => {}}
        onDraftCancel={() => {}}
      />,
    );
    const nodes = document.querySelectorAll('.ftree-node');
    expect(nodes.length).toBe(6); // draft 1 + ノード 5
    // 入力値は textContent に現れないため input.value で検証する
    expect((nodes[0].querySelector('.ftree-draft-input') as HTMLInputElement).value).toBe('新規');
    expect(nodes[1].textContent).toContain('A');
  });

  it('フォルダ配下の下書き行は親の直後に差し込まれ、親が折り畳み中は現れない', () => {
    const draftProps = {
      draft,
      onDraftChange: () => {},
      onDraftCommit: () => {},
      onDraftCancel: () => {},
    };
    const first = withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        {...draftProps}
      />,
    );
    const nodes = document.querySelectorAll('.ftree-node');
    // a の直後に draft（b の前）
    expect(nodes[0].textContent).toContain('A');
    expect((nodes[1].querySelector('.ftree-draft-input') as HTMLInputElement).value).toBe('新規');
    expect(nodes[2].textContent).toContain('B');
    // 親 a が折り畳み中なら draft も現れない（fil-0072 と同じ可視規則）
    first.unmount();
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        {...draftProps}
        collapsedIds={new Set(['a'])}
        onToggleCollapse={() => {}}
      />,
    );
    // 折り畳み中は draft 行自体が描画されない（input の aria-label で存在を確認）
    expect(screen.queryByLabelText('新規フォルダ名')).toBeNull();
  });

  it('検索結果ヘッダが active 時のみ表示され、件数と解除 × が仕様どおり', () => {
    const results: SearchResultItem[] = [
      { kind: 'folder', id: 'x', name: 'X', parentFolderId: null },
      { kind: 'file', id: 'y', name: 'Y', parentFolderId: 'a' },
    ];
    // active=false → ヘッダ自体を描画しない
    const off = withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        search={{ active: false, loading: false, error: false, results: [] }}
      />,
    );
    expect(screen.queryByText(/検索結果/)).toBeNull();
    off.unmount();

    // active=true + onClear 省略 → 件数付きヘッダ・× 非表示（後方互換）
    const noClear = withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        search={{ active: true, loading: false, error: false, results }}
      />,
    );
    expect(screen.getByText('検索結果（2）')).toBeTruthy();
    expect(screen.queryByLabelText('検索結果を解除')).toBeNull();
    noClear.unmount();

    // onClear あり → × 表示・クリックで呼ばれる
    const onClear = vi.fn();
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        search={{ active: true, loading: false, error: false, results, onClear }}
      />,
    );
    fireEvent.click(screen.getByLabelText('検索結果を解除'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('全フォルダ行が OS ドロップの受け口になる（権限による除外は ADR 0063 で撤廃）', () => {
    const getZoneProps = vi.fn(() => noopDropProps);
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId="a"
        dndDisabled
        onSelect={() => {}}
        fileDrop={{ activeZone: null, getZoneProps }}
      />,
    );
    expect(getZoneProps).toHaveBeenCalledWith('tree:a', 'a');
    expect(getZoneProps).toHaveBeenCalledWith('tree:b', 'b');
    expect(getZoneProps).toHaveBeenCalledWith('tree:d', 'd');
    expect(getZoneProps).toHaveBeenCalledWith('tree:e', 'e');
  });
});
