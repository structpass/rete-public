import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeskTaskToolbar } from '../components/desk-task-toolbar';

const renderToolbar = (props: Partial<Parameters<typeof DeskTaskToolbar>[0]> = {}) =>
  render(<DeskTaskToolbar onCreate={vi.fn()} onOpenCategorySettings={vi.fn()} {...props} />);

// タスク明細の新規登録ツールバー。C-新規（ticket 0031）で onCreate に配線済み。
describe('DeskTaskToolbar', () => {
  it('新規登録ボタンは操作可能（aria-disabled なし）であること', () => {
    renderToolbar();
    const btn = screen.getByRole('button', { name: '新規登録' });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(btn).not.toHaveAttribute('tabindex', '-1');
  });

  it('新規登録ボタン押下で onCreate を呼ぶこと', () => {
    const onCreate = vi.fn();
    renderToolbar({ onCreate });
    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  // 分類設定ボタン（rete-desk-0140）。新規登録の左隣に置き、分類マスタ設定モーダルを開く。
  it('分類設定ボタン押下で onOpenCategorySettings を呼ぶこと', () => {
    const onOpenCategorySettings = vi.fn();
    renderToolbar({ onOpenCategorySettings });
    fireEvent.click(screen.getByRole('button', { name: '分類設定' }));
    expect(onOpenCategorySettings).toHaveBeenCalledTimes(1);
  });

  it('分類設定ボタンは新規登録ボタンの左（DOM 順で前）にあること', () => {
    renderToolbar();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['分類設定', '新規登録']);
  });
});
