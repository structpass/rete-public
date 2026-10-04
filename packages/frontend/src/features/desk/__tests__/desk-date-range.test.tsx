import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeskTaskForm } from '../components/desk-task-form';
import type { Category } from '@/features/tasks/lib/api';

const categories: Category[] = [
  {
    id: 1,
    name: '入荷',
    sortOrder: 0,
    archived: false,
    spaceId: 's1',
    createdAt: '',
    updatedAt: '',
  },
];

/**
 * v2-170: Desk のタスク属性（開始日・期日）は個別の日付入力ではなく、どちらの行から開いても同じ
 * 期日範囲 popover（フィルタの期日範囲と共通の DeskDateRangePopover）で入力する。
 */
describe('Desk の開始日・期日（1コンポーネント入力 / v2-170）', () => {
  function renderForm() {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<DeskTaskForm mode="create" categories={categories} onSubmit={onSubmit} />);
    return { onSubmit };
  }

  const startRow = () => screen.getByRole('button', { name: '開始日' });
  const dueRow = () => screen.getByRole('button', { name: '期日' });
  const rangeDialog = () => screen.getByRole('dialog', { name: '開始日・期日の範囲' });
  // popover の入力ラベルは呼び出し元の項目名（開始日 / 期日）に揃える。行の trigger も同じ語を持つため、
  // dialog 内に絞って引く（フィルタ側の文言とは別の呼び出し元）。
  const fromInput = () => within(rangeDialog()).getByLabelText('開始日');
  const toInput = () => within(rangeDialog()).getByLabelText('期日');

  it('未設定のときは両方の行が「—」で、popover は開いていないこと', () => {
    renderForm();
    expect(startRow()).toHaveTextContent('—');
    expect(dueRow()).toHaveTextContent('—');
    expect(screen.queryByRole('dialog', { name: '開始日・期日の範囲' })).not.toBeInTheDocument();
  });

  it('開始日から開いても期日から開いても同じ期日範囲 popover が出ること', async () => {
    renderForm();

    await userEvent.click(startRow());
    expect(rangeDialog()).toBeInTheDocument();
    // 開始日側から開いた時は From へフォーカスが入る（そのまま範囲の起点を打てる）。
    expect(fromInput()).toHaveFocus();

    await userEvent.click(startRow()); // 同じ行の再クリックで閉じる
    expect(screen.queryByRole('dialog', { name: '開始日・期日の範囲' })).not.toBeInTheDocument();

    await userEvent.click(dueRow());
    expect(rangeDialog()).toBeInTheDocument();
    expect(toInput()).toHaveFocus();
  });

  it('1画面の From/To 入力が両方の行へ即反映され、クリアで両方戻ること', async () => {
    renderForm();
    await userEvent.click(startRow());

    fireEvent.change(fromInput(), { target: { value: '2026-09-15' } });
    fireEvent.change(toInput(), { target: { value: '2026-10-01' } });

    // 開始日から開いた1画面の入力で、開始日・期日の両方がセットされる。
    expect(startRow()).toHaveTextContent('2026/09/15');
    expect(dueRow()).toHaveTextContent('2026/10/01');

    await userEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(startRow()).toHaveTextContent('—');
    expect(dueRow()).toHaveTextContent('—');
  });

  it('入力した日付が startDate / dueDate として submit されること', async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(screen.getByLabelText('タイトル'), '期日つきチケット');

    await userEvent.click(dueRow());
    fireEvent.change(fromInput(), { target: { value: '2026-09-15' } });
    fireEvent.change(toInput(), { target: { value: '2026-10-01' } });

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      startDate: '2026-09-15',
      dueDate: '2026-10-01',
    });
  });

  it('外側クリックと Esc で popover が閉じること', async () => {
    renderForm();

    await userEvent.click(startRow());
    // 外側＝popover と 2 行の外（body 直下の click は dsk-0310 の focus 復帰ガードで閉じないため、
    // 画面内の別要素をクリックする）。
    await userEvent.click(screen.getByLabelText('タイトル'));
    expect(screen.queryByRole('dialog', { name: '開始日・期日の範囲' })).not.toBeInTheDocument();

    await userEvent.click(startRow());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '開始日・期日の範囲' })).not.toBeInTheDocument();
  });
});
