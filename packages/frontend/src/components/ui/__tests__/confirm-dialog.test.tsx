import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../confirm-dialog';

const message = '分類「出荷」を削除しますか？削除すると元に戻せません。';

describe('ConfirmDialog', () => {
  it('ボタン文言と並びをキャンセル／OKに固定する', () => {
    render(
      <ConfirmDialog open message={message} destructive onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'キャンセル',
      'OK',
    ]);
  });

  it('destructive=true のOKだけを赤くする', () => {
    const { rerender } = render(
      <ConfirmDialog open message={message} destructive onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'OK' }).className).toMatch(/sp-accent-red/);

    rerender(
      <ConfirmDialog
        open
        message="田中さんとダイレクトメッセージを開始します。"
        destructive={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'OK' }).className).not.toMatch(/sp-accent-red/);
  });

  it('OKとキャンセルをそれぞれ通知する', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        open
        message={message}
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialog
        open
        message={message}
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('busy中は両ボタンとEscによる取消を拒否する', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        busy
        open
        message={message}
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
