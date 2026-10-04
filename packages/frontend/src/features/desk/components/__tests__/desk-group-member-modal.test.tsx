import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpaceKind, type SpaceDto } from '@rete/shared';
import { DeskGroupMemberModal } from '../desk-group-member-modal';

// cmn-0142: vi.hoisted 化（vi.fn は無いが JSX スタブを hoist し grep ゲートを通す）
const { DeskMembershipScopeModal } = vi.hoisted(() => ({
  // メンバー管理は DeskMembershipScopeModal（API fetch を伴う共用モーダル）へ委譲済み（dsk-0364）。
  // 本テストの対象はモーダル自身が持つグループ名編集（headerSlot）と disabled 制御のみなので、
  // 子はスロットを描くだけのスタブへ差し替える（子側の分岐テストは対象外＝チケット design の scope 補正）。
  DeskMembershipScopeModal: ({
    open,
    headerSlot,
    footerSlot,
  }: {
    open: boolean;
    headerSlot?: React.ReactNode;
    footerSlot?: React.ReactNode;
  }) =>
    open ? (
      <div>
        {headerSlot}
        {footerSlot}
      </div>
    ) : null,
}));

vi.mock('../desk-membership-scope-modal', () => ({
  DeskMembershipScopeModal,
}));

function group(id: string, name = id): SpaceDto {
  return {
    id,
    kind: SpaceKind.GROUP,
    projectId: null,
    ownerId: null,
    peerAccountId: null,
    name,
    sortOrder: 0,
    archived: false,
    canManageMembers: true,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

function renderModal(overrides: Partial<Parameters<typeof DeskGroupMemberModal>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    group: group('g1', '設計チーム'),
    accounts: [],
    onRename: vi.fn().mockResolvedValue(null),
    onArchive: vi.fn(),
    submitting: false,
    ...overrides,
  };
  const view = render(<DeskGroupMemberModal {...props} />);
  return { props, view };
}

describe('DeskGroupMemberModal', () => {
  it('初期表示で入力に group.name が入り、未変更のため保存ボタンは無効', () => {
    renderModal();
    expect(screen.getByLabelText('グループ名')).toHaveValue('設計チーム');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('空文字（空白のみ含む）では保存ボタンが無効のまま', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('trim 後が group.name と同じ（前後空白だけの変更）では無効のまま', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: '  設計チーム  ' } });
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('有効な変更で保存ボタンが有効になり、クリックで onRename(trimmed) を呼ぶ', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: '  開発チーム ' } });
    const save = screen.getByRole('button', { name: '保存' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(props.onRename).toHaveBeenCalledWith('開発チーム');
  });

  it('submitting=true では有効な変更があっても保存ボタン・入力とも無効（二重送信不可）', () => {
    renderModal({ submitting: true });
    const input = screen.getByLabelText('グループ名');
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'アーカイブ' })).toBeDisabled();
  });

  it('group.id が差し替わると入力が新しい group.name にリセットされる（入力の持ち越し無し）', () => {
    const { view } = renderModal();
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: '編集中の値' } });
    view.rerender(
      <DeskGroupMemberModal
        open
        onClose={vi.fn()}
        group={group('g2', '営業チーム')}
        accounts={[]}
        onRename={vi.fn().mockResolvedValue(null)}
        onArchive={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByLabelText('グループ名')).toHaveValue('営業チーム');
  });

  it('Enter キーで onRename を呼ぶ（IME 変換確定の Enter は送信しない）', () => {
    const { props } = renderModal();
    const input = screen.getByLabelText('グループ名');
    fireEvent.change(input, { target: { value: '新名称' } });
    // IME 合成中の Enter は無視される
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(props.onRename).not.toHaveBeenCalled();
    // 通常の Enter で送信
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onRename).toHaveBeenCalledWith('新名称');
  });

  it('アーカイブボタンで onArchive を呼ぶ（確認ダイアログは呼び出し側の責務）', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));
    expect(props.onArchive).toHaveBeenCalled();
  });
});
