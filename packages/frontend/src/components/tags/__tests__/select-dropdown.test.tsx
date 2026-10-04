import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SelectDropdown } from '../select-dropdown';

// hom-0099/hom-0100: announcement-form 経由の間接カバーのみだった emptyText / clearLabel /
// menuLabel(Label in Name) 分岐を直接固定する（quality-review 2026-07-05 で検出されたテスト欠落を解消）。

const items = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

describe('SelectDropdown', () => {
  afterEach(() => cleanup());

  it('トリガークリックでメニューが開き、triggerLabel が aria-label のデフォルトになる', () => {
    render(
      <SelectDropdown
        items={items}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        triggerLabel="編集"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '編集' }));

    expect(screen.getByRole('menu', { name: '編集' })).toBeInTheDocument();
  });

  it('menuLabel 指定時はそちらが aria-label になる（Label in Name）', () => {
    render(
      <SelectDropdown
        items={items}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        triggerLabel="編集"
        menuLabel="通知先を編集"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '編集' }));

    expect(screen.getByRole('menu', { name: '通知先を編集' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: '編集' })).not.toBeInTheDocument();
  });

  it('項目クリックで onToggle が呼ばれ、aria-checked が選択状態を反映する', () => {
    const onToggle = vi.fn();
    render(
      <SelectDropdown
        items={items}
        selectedIds={['1']}
        onToggle={onToggle}
        onClear={vi.fn()}
        triggerLabel="編集"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '編集' }));

    const aliceItem = screen.getByRole('menuitemcheckbox', { name: /Alice/ });
    expect(aliceItem).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: /Bob/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    fireEvent.click(aliceItem);
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  it('選択が0件の時は全解除行を表示しない、1件以上で表示し onClear を呼ぶ', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <SelectDropdown
        items={items}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={onClear}
        triggerLabel="編集"
        clearLabel="選択を解除"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    expect(screen.queryByRole('button', { name: '選択を解除' })).not.toBeInTheDocument();

    rerender(
      <SelectDropdown
        items={items}
        selectedIds={['1']}
        onToggle={vi.fn()}
        onClear={onClear}
        triggerLabel="編集"
        clearLabel="選択を解除"
      />,
    );
    const clearButton = screen.getByRole('button', { name: '選択を解除' });
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('items が空で emptyText 指定時は案内文を表示し、未指定時は空メニューになる', () => {
    const { rerender } = render(
      <SelectDropdown
        items={[]}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        triggerLabel="編集"
        emptyText="項目がありません"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    expect(screen.getByText('項目がありません')).toBeInTheDocument();

    rerender(
      <SelectDropdown
        items={[]}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        triggerLabel="編集"
      />,
    );
    expect(screen.queryByText('項目がありません')).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: '編集' })).toBeEmptyDOMElement();
  });

  it('disabled 時はトリガーボタンが無効化される', () => {
    render(
      <SelectDropdown
        items={items}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        triggerLabel="編集"
        disabled
      />,
    );
    expect(screen.getByRole('button', { name: '編集' })).toBeDisabled();
  });
});
