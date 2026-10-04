import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SpaceKind, type SpaceDto } from '@rete/shared';
import { DeskCreateGroupForm } from '../desk-create-group-form';

function group(id: string): SpaceDto {
  return {
    id,
    kind: SpaceKind.GROUP,
    projectId: null,
    ownerId: null,
    peerAccountId: null,
    name: id,
    sortOrder: 0,
    archived: false,
    canManageMembers: true,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('DeskCreateGroupForm', () => {
  it('空名では作成ボタンが無効、入力で有効化される', () => {
    render(<DeskCreateGroupForm onCreate={vi.fn()} onClose={vi.fn()} submitting={false} />);
    const submit = screen.getByRole('button', { name: 'グループ作成' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: '設計' } });
    expect(submit).toBeEnabled();
  });

  it('作成成功（SpaceDto 返却）で onClose が呼ばれる', async () => {
    const onCreate = vi.fn().mockResolvedValue(group('g1'));
    const onClose = vi.fn();
    render(<DeskCreateGroupForm onCreate={onCreate} onClose={onClose} submitting={false} />);
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: '設計チーム' } });
    fireEvent.click(screen.getByRole('button', { name: 'グループ作成' }));
    expect(onCreate).toHaveBeenCalledWith('設計チーム');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('作成失敗（null 返却）では onClose しない（フォーム据え置きで再入力可）', async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    const onClose = vi.fn();
    render(<DeskCreateGroupForm onCreate={onCreate} onClose={onClose} submitting={false} />);
    fireEvent.change(screen.getByLabelText('グループ名'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'グループ作成' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc キーで onClose する', () => {
    const onClose = vi.fn();
    render(<DeskCreateGroupForm onCreate={vi.fn()} onClose={onClose} submitting={false} />);
    fireEvent.keyDown(screen.getByLabelText('グループ名'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
