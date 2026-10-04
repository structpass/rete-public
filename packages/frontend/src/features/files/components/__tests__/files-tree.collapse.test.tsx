import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { FilesTree } from '../files-tree';
import type { TreeNode } from '../../lib/types';

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

describe('FilesTree（fil-0072/fil-0073 折り畳み）', () => {
  it('collapsedIds 未指定なら全行描画・葉ノードシェブロンは右向き', () => {
    withDnd(<FilesTree tree={tree} currentFolderId={null} dndDisabled onSelect={() => {}} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.getByText('E')).toBeTruthy();
    // C と E は葉なので ChevronRight（右向き）。aria-label は付かない（canToggle=false）。
    const cLabel = screen.getByText('C').parentElement?.querySelector('.ftree-chev');
    expect(cLabel?.getAttribute('aria-label')).toBeNull();
  });

  it('子を持つノードのシェブロンクリックで toggle が呼ばれ、行本体の onSelect は発火しない', () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={onSelect}
        collapsedIds={new Set()}
        onToggleCollapse={onToggle}
      />,
    );
    // A のシェブロン（A は子持ち）を取得して click
    const aRow = screen.getByText('A').closest('.ftree-node')!;
    const aChevron = aRow.querySelector('.ftree-chev')!;
    fireEvent.click(aChevron);
    expect(onToggle).toHaveBeenCalledWith('a');
    expect(onSelect).not.toHaveBeenCalled(); // シェブロンクリックではフォルダ遷移しない
  });

  it('葉ノードのシェブロンは toggle を呼ばない（装飾扱い・後方互換）', () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={onSelect}
        collapsedIds={new Set()}
        onToggleCollapse={onToggle}
      />,
    );
    // C（葉）のシェブロン部分
    const cRow = screen.getByText('C').closest('.ftree-node')!;
    const cChevron = cRow.querySelector('.ftree-chev')!;
    fireEvent.click(cChevron);
    expect(onToggle).not.toHaveBeenCalled();
    // 行本体クリックは onSelect を発火する（後方互換）。
    fireEvent.click(cRow);
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('折り畳まれた祖先のサブツリーは描画されない', () => {
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        collapsedIds={new Set(['a'])}
        onToggleCollapse={() => {}}
      />,
    );
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('E')).toBeTruthy();
    // A の子は全て隠れる（B / C / D）
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.queryByText('C')).toBeNull();
    expect(screen.queryByText('D')).toBeNull();
  });

  it('シェブロンの向きは折り畳み中は右・展開中は下', () => {
    const { rerender } = withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        collapsedIds={new Set(['a'])}
        onToggleCollapse={() => {}}
      />,
    );
    // a は折り畳み中 → aria-label は「展開」
    const aChevronCollapsed = screen
      .getByText('A')
      .closest('.ftree-node')!
      .querySelector('.ftree-chev')!;
    expect(aChevronCollapsed.getAttribute('aria-label')).toBe('A を展開');
    expect(aChevronCollapsed.getAttribute('aria-expanded')).toBe('false');

    // 展開中に切り替え
    rerender(
      <DndContext>
        <FilesTree
          tree={tree}
          currentFolderId={null}
          dndDisabled
          onSelect={() => {}}
          collapsedIds={new Set()}
          onToggleCollapse={() => {}}
        />
      </DndContext>,
    );
    const aChevronExpanded = screen
      .getByText('A')
      .closest('.ftree-node')!
      .querySelector('.ftree-chev')!;
    expect(aChevronExpanded.getAttribute('aria-label')).toBe('A を折り畳み');
    expect(aChevronExpanded.getAttribute('aria-expanded')).toBe('true');
  });

  it('シェブロンのキーボード操作（Enter / Space）で toggle できる', () => {
    const onToggle = vi.fn();
    withDnd(
      <FilesTree
        tree={tree}
        currentFolderId={null}
        dndDisabled
        onSelect={() => {}}
        collapsedIds={new Set()}
        onToggleCollapse={onToggle}
      />,
    );
    const aChevron = screen
      .getByText('A')
      .closest('.ftree-node')!
      .querySelector('.ftree-chev')! as HTMLElement;
    aChevron.focus();
    fireEvent.keyDown(aChevron, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledWith('a');
    fireEvent.keyDown(aChevron, { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenLastCalledWith('a');
  });
});
