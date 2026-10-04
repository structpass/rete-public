import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscardConfirmDialog } from '../discard-confirm-dialog';
import { useDiscardConfirm } from '@/hooks/use-discard-confirm';

/** hook + dialog を結線した実利用相当の最小ハーネス（end-to-end 契約の回帰固定用）。 */
function DiscardHarness({ onProceed }: { onProceed: () => void }) {
  const discard = useDiscardConfirm();
  return (
    <>
      <button type="button" onClick={() => discard.request(true, onProceed)}>
        trigger
      </button>
      <DiscardConfirmDialog
        open={discard.open}
        onConfirm={discard.onConfirm}
        onCancel={discard.onCancel}
      />
    </>
  );
}

describe('DiscardConfirmDialog', () => {
  it('open=false の間は何も表示しない', () => {
    render(<DiscardConfirmDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('open=true で確認文（既定）を表示する', () => {
    render(<DiscardConfirmDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      screen.getByText('編集中の内容を破棄しますか？保存していない変更は失われます。'),
    ).toBeInTheDocument();
  });

  it('message で確認文を差し替えられる', () => {
    render(
      <DiscardConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        message="入力中の内容を破棄しますか？"
      />,
    );
    expect(screen.getByText('入力中の内容を破棄しますか？')).toBeInTheDocument();
  });

  it('「OK」で onConfirm が呼ばれる', async () => {
    const onConfirm = vi.fn();
    render(<DiscardConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('「キャンセル」で onCancel が呼ばれる', async () => {
    const onCancel = vi.fn();
    render(<DiscardConfirmDialog open onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalled();
  });

  // hook + dialog 結線での end-to-end 契約。Radix の onClick→onOpenChange 実行順に関わらず、
  // 保留アクション（proceed）はちょうど 1 回だけ発火する（onConfirm/onCancel 二重発火でも二重実行・
  // サイレント不発が起きないことを固定 / code-review MEDIUM 対応）。
  it('OK で保留アクションがちょうど 1 回発火しダイアログが閉じる', async () => {
    const onProceed = vi.fn();
    render(<DiscardHarness onProceed={onProceed} />);
    await userEvent.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('キャンセルで保留アクションは発火せずダイアログが閉じる', async () => {
    const onProceed = vi.fn();
    render(<DiscardHarness onProceed={onProceed} />);
    await userEvent.click(screen.getByRole('button', { name: 'trigger' }));
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onProceed).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
