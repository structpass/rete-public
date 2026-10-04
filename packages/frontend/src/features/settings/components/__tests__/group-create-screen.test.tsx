import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupCreateScreen } from '../group-create-screen';

const api = vi.hoisted(() => ({
  createUserGroup: vi.fn(),
  addUserGroupMember: vi.fn(),
}));
vi.mock('../../lib/groups-api', () => api);

const membersApi = vi.hoisted(() => ({ fetchMembers: vi.fn() }));
vi.mock('../../lib/members-api', () => membersApi);

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

vi.mock('@/features/auth/components/session-provider', () => ({
  useSessionContext: () => ({
    user: { id: 'u1', email: 'admin@rete.local', name: 'Admin', role: 'ADMIN' },
    loading: false,
    menuItems: [],
  }),
}));

describe('GroupCreateScreen（作成サブ画面・set-0188）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membersApi.fetchMembers.mockResolvedValue([
      { id: 'acc-1', name: '田中 太郎' },
      { id: 'acc-2', name: '佐藤 花子' },
    ]);
    api.createUserGroup.mockResolvedValue({
      id: 'grp-9',
      name: '新チーム',
      sortOrder: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    api.addUserGroupMember.mockResolvedValue({ created: true });
  });

  it('グループ名と所属ユーザー（追加・除外）を決めて作成し、一覧へ戻る', async () => {
    const user = userEvent.setup();
    render(<GroupCreateScreen />);
    await screen.findByRole('heading', { level: 2, name: '管理グループを作成' });

    // グループ名が空のうちは作成できない
    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled();

    await user.type(screen.getByLabelText('グループ名'), '新チーム');

    // 追加 → 除外（作成前は画面内で取り消せる）
    await user.selectOptions(screen.getByLabelText('追加するユーザー'), 'acc-1');
    await user.click(screen.getByRole('button', { name: 'ユーザーを追加' }));
    expect(screen.getByRole('cell', { name: '田中 太郎' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '田中 太郎 を所属ユーザーから除外' }));
    expect(screen.queryByRole('cell', { name: '田中 太郎' })).not.toBeInTheDocument();

    // 追加し直してから作成
    await user.selectOptions(screen.getByLabelText('追加するユーザー'), 'acc-1');
    await user.click(screen.getByRole('button', { name: 'ユーザーを追加' }));
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => expect(api.createUserGroup).toHaveBeenCalledWith({ name: '新チーム' }));
    await waitFor(() =>
      expect(api.addUserGroupMember).toHaveBeenCalledWith({ groupId: 'grp-9', accountId: 'acc-1' }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/settings/groups'));
  });

  it('所属ユーザーが空でも名前だけで作成できる', async () => {
    const user = userEvent.setup();
    render(<GroupCreateScreen />);
    await screen.findByRole('heading', { level: 2, name: '管理グループを作成' });

    await user.type(screen.getByLabelText('グループ名'), '新チーム');
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => expect(api.createUserGroup).toHaveBeenCalledWith({ name: '新チーム' }));
    expect(api.addUserGroupMember).not.toHaveBeenCalled();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/settings/groups'));
  });

  it('キャンセルは一覧へ戻るだけ（作成しない）', async () => {
    const user = userEvent.setup();
    render(<GroupCreateScreen />);
    await screen.findByRole('heading', { level: 2, name: '管理グループを作成' });

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(router.push).toHaveBeenCalledWith('/settings/groups');
    expect(api.createUserGroup).not.toHaveBeenCalled();
  });

  it('アーカイブの導線を持たない', async () => {
    render(<GroupCreateScreen />);
    await screen.findByRole('heading', { level: 2, name: '管理グループを作成' });

    expect(screen.queryByText(/アーカイブ/)).not.toBeInTheDocument();
  });
});
