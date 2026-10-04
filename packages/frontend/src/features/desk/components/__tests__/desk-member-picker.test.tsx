import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SpaceKind, type SpaceDto } from '@rete/shared';
import type { Account } from '@/features/tasks/lib/api';
import { DeskMemberPicker } from '../desk-member-picker';

const candidates: Account[] = [
  { id: 'a1', name: '田中 太郎' },
  { id: 'a2', name: '鈴木 花子' },
];

function dm(id: string): SpaceDto {
  return {
    id,
    kind: SpaceKind.PERSONAL_DM,
    projectId: null,
    ownerId: null,
    peerAccountId: null,
    name: id,
    sortOrder: 0,
    archived: false,
    canManageMembers: false,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('DeskMemberPicker', () => {
  it('候補を一覧表示し、選択で onPick(accountId) を呼ぶ', async () => {
    const onPick = vi.fn().mockResolvedValue(dm('dm1'));
    const onClose = vi.fn();
    render(
      <DeskMemberPicker
        candidates={candidates}
        onPick={onPick}
        onClose={onClose}
        submitting={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /田中 太郎/ }));
    expect(onPick).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('検索で候補を名前部分一致に絞る', () => {
    render(
      <DeskMemberPicker
        candidates={candidates}
        onPick={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('メンバーを検索'), { target: { value: '鈴木' } });
    expect(screen.queryByRole('button', { name: /田中 太郎/ })).toBeNull();
    expect(screen.getByRole('button', { name: /鈴木 花子/ })).toBeInTheDocument();
  });

  it('候補が空なら案内文を出す（自分＋既存相手を除外した結果ゼロ）', () => {
    render(
      <DeskMemberPicker candidates={[]} onPick={vi.fn()} onClose={vi.fn()} submitting={false} />,
    );
    expect(screen.getByText('追加できるメンバーがいません')).toBeInTheDocument();
  });

  it('Esc キーで onClose する', () => {
    const onClose = vi.fn();
    render(
      <DeskMemberPicker
        candidates={candidates}
        onPick={vi.fn()}
        onClose={onClose}
        submitting={false}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('メンバーを検索'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('floating 時は sidebar-member-picker--floating を付与する（dsk-0308）', () => {
    const { container } = render(
      <DeskMemberPicker
        floating
        candidates={candidates}
        onPick={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    expect(container.querySelector('.sidebar-member-picker--floating')).toBeTruthy();
  });

  it('floating 未指定時は --floating 修飾クラスを付けない', () => {
    const { container } = render(
      <DeskMemberPicker
        candidates={candidates}
        onPick={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    expect(container.querySelector('.sidebar-member-picker')).toBeTruthy();
    expect(container.querySelector('.sidebar-member-picker--floating')).toBeNull();
  });

  // ===== dsk-0353: 確認ダイアログ対応 =====

  describe('getConfirmMessage 指定時の確認ステップ (dsk-0353)', () => {
    const confirmFor = (a: Account) => `${a.name} とダイレクトメッセージを開始しますか？`;

    it('候補クリックでは onPick を呼ばず、確認ダイアログ（alertdialog）を出す', async () => {
      const onPick = vi.fn().mockResolvedValue(dm('dm1'));
      render(
        <DeskMemberPicker
          candidates={candidates}
          onPick={onPick}
          onClose={vi.fn()}
          submitting={false}
          getConfirmMessage={confirmFor}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /田中 太郎/ }));
      expect(onPick).not.toHaveBeenCalled();
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('田中 太郎 とダイレクトメッセージを開始しますか？');
    });

    it('「OK」で onPick が呼ばれ、成功で onClose する', async () => {
      const onPick = vi.fn().mockResolvedValue(dm('dm1'));
      const onClose = vi.fn();
      render(
        <DeskMemberPicker
          candidates={candidates}
          onPick={onPick}
          onClose={onClose}
          submitting={false}
          getConfirmMessage={confirmFor}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /田中 太郎/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
      await waitFor(() => expect(onPick).toHaveBeenCalledWith('a1'));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('「キャンセル」で onPick を呼ばず、一覧表示へ戻る', async () => {
      const onPick = vi.fn().mockResolvedValue(dm('dm1'));
      render(
        <DeskMemberPicker
          candidates={candidates}
          onPick={onPick}
          onClose={vi.fn()}
          submitting={false}
          getConfirmMessage={confirmFor}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /田中 太郎/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
      expect(onPick).not.toHaveBeenCalled();
      // 一覧が復帰している（候補ボタンが再度押せる）。
      expect(screen.getByRole('button', { name: /田中 太郎/ })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    });

    it('getConfirmMessage が undefined を返した候補は確認ステップをスキップして即 onPick する（dsk-0353）', async () => {
      // 動的に「確認不要」候補を差し込む運用（例：既に DM 済みの相手等）のための逃げ道。
      const onPick = vi.fn().mockResolvedValue(dm('dm1'));
      const onClose = vi.fn();
      const accounts: Account[] = [
        { id: 'a1', name: '田中 太郎' },
        { id: 'a2', name: '鈴木 花子' },
      ];
      render(
        <DeskMemberPicker
          candidates={accounts}
          onPick={onPick}
          onClose={onClose}
          submitting={false}
          getConfirmMessage={(a) => (a.id === 'a2' ? undefined : `${a.name} と開始しますか？`)}
        />,
      );
      // 鈴木 花子は undefined → 即 onPick。
      fireEvent.click(screen.getByRole('button', { name: /鈴木 花子/ }));
      await waitFor(() => expect(onPick).toHaveBeenCalledWith('a2'));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('submitting 中は確認ステップに入っても「開始する」が disabled', () => {
      const onPick = vi.fn().mockResolvedValue(dm('dm1'));
      render(
        <DeskMemberPicker
          candidates={candidates}
          onPick={onPick}
          onClose={vi.fn()}
          submitting
          getConfirmMessage={confirmFor}
        />,
      );
      // submitting 中は元の一覧で候補ボタンが disabled。
      expect(screen.getByRole('button', { name: /田中 太郎/ })).toBeDisabled();
    });
  });

  // ===== dsk-0358: floating 時の outside-click 閉じ =====

  describe('floating 時の outside-click 閉じ (dsk-0358)', () => {
    it('floating=true で外側要素 click → onClose が呼ばれる', () => {
      const onClose = vi.fn();
      render(
        <div>
          <DeskMemberPicker
            floating
            candidates={candidates}
            onPick={vi.fn()}
            onClose={onClose}
            submitting={false}
          />
          <button type="button" data-testid="outside-target">
            outside
          </button>
        </div>,
      );
      fireEvent.click(screen.getByTestId('outside-target'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('floating=true で検索 input を click → onClose は呼ばれない', () => {
      const onClose = vi.fn();
      render(
        <DeskMemberPicker
          floating
          candidates={candidates}
          onPick={vi.fn()}
          onClose={onClose}
          submitting={false}
        />,
      );
      fireEvent.click(screen.getByLabelText('メンバーを検索'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('floating=true で候補 button を click → onClose は呼ばれない（候補クリックの挙動と独立）', () => {
      const onClose = vi.fn();
      render(
        <DeskMemberPicker
          floating
          candidates={candidates}
          onPick={vi.fn()}
          onClose={onClose}
          submitting={false}
        />,
      );
      // 候補ボタンの click は picker 内部要素なので onClose は呼ばれない（onPick は mock で何も返さないが
      // ここで検証したいのは onClose が呼ばれないことのみ）。
      fireEvent.click(screen.getByRole('button', { name: /田中 太郎/ }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('floating=false（モーダル内利用）時は外側 click で onClose は呼ばれない（挙動不変）', () => {
      const onClose = vi.fn();
      render(
        <div>
          <DeskMemberPicker
            candidates={candidates}
            onPick={vi.fn()}
            onClose={onClose}
            submitting={false}
          />
          <button type="button" data-testid="outside-target">
            outside
          </button>
        </div>,
      );
      fireEvent.click(screen.getByTestId('outside-target'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('floating=true で document.body への click では onClose は呼ばれない（dsk-0310 ガード継承）', () => {
      const onClose = vi.fn();
      render(
        <DeskMemberPicker
          floating
          candidates={candidates}
          onPick={vi.fn()}
          onClose={onClose}
          submitting={false}
        />,
      );
      fireEvent.click(document.body);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('floating=true で Esc → onClose が呼ばれる', () => {
      const onClose = vi.fn();
      render(
        <DeskMemberPicker
          floating
          candidates={candidates}
          onPick={vi.fn()}
          onClose={onClose}
          submitting={false}
        />,
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('確認ダイアログ表示中に外側 click → onClose が呼ばれる（confirm 内側 click は除く）', () => {
      // 確認ダイアログ自体も同じ outer container の内側なので、内側 click では閉じない。
      const onClose = vi.fn();
      const onPick = vi.fn().mockResolvedValue(dm('dm1'));
      const confirmFor = (a: Account) => `${a.name} と開始しますか？`;
      render(
        <div>
          <DeskMemberPicker
            floating
            candidates={candidates}
            onPick={onPick}
            onClose={onClose}
            submitting={false}
            getConfirmMessage={confirmFor}
          />
          <button type="button" data-testid="outside-target">
            outside
          </button>
        </div>,
      );
      fireEvent.click(screen.getByRole('button', { name: /田中 太郎/ }));
      // 確認ダイアログに遷移。ダイアログ内でキャンセル click → onClose は呼ばれない。
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(onClose).not.toHaveBeenCalled();
      // 一覧に復帰後、外側 click → onClose 呼ばれる。
      fireEvent.click(screen.getByTestId('outside-target'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
