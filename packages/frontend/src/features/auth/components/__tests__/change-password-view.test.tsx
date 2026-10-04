import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { flush } from '@/test-utils/flush';
import { ChangePasswordView } from '../change-password-view';

// cmn-0142: vi.hoisted 化
const { mockReplace, mockChangePassword, mockSetUser } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockChangePassword: vi.fn(),
  mockSetUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('../../lib/api', () => ({
  changePassword: (current: string, next: string) => mockChangePassword(current, next),
}));

vi.mock('../session-provider', () => ({
  useSessionContext: () => ({
    user: { id: 'acc-1', email: 'admin@rete.local', mustChangePassword: true },
    loading: false,
    setUser: mockSetUser,
  }),
}));

// policySatisfied を常に true にして送信ゲートを confirmPassword 側の条件だけに絞る（set-0041 対象）。
vi.mock('../../hooks/use-password-policy', () => ({
  usePasswordPolicy: () => ({ rules: [], allSatisfied: true, policyLoaded: true }),
}));

function fillCurrentAndNew(current: string, next: string) {
  fireEvent.change(document.querySelector('#current-password') as HTMLInputElement, {
    target: { value: current },
  });
  fireEvent.change(document.querySelector('#new-password') as HTMLInputElement, {
    target: { value: next },
  });
}

describe('ChangePasswordView — 送信ボタンの disabled 条件（set-0041 ③）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirmPassword が未入力なら disabled', async () => {
    render(<ChangePasswordView />);
    fillCurrentAndNew('current-pw', 'NewPassw0rd!');
    await flush();

    expect(screen.getByRole('button', { name: 'パスワード変更' })).toBeDisabled();
  });

  it('newPassword と confirmPassword が不一致なら disabled', async () => {
    render(<ChangePasswordView />);
    fillCurrentAndNew('current-pw', 'NewPassw0rd!');
    fireEvent.change(document.querySelector('#confirm-password') as HTMLInputElement, {
      target: { value: 'DifferentPassw0rd!' },
    });
    await flush();

    expect(screen.getByRole('button', { name: 'パスワード変更' })).toBeDisabled();
  });

  it('current/new/confirm が揃い一致すれば有効化される', async () => {
    render(<ChangePasswordView />);
    fillCurrentAndNew('current-pw', 'NewPassw0rd!');
    fireEvent.change(document.querySelector('#confirm-password') as HTMLInputElement, {
      target: { value: 'NewPassw0rd!' },
    });
    await flush();

    expect(screen.getByRole('button', { name: 'パスワード変更' })).not.toBeDisabled();
  });
});
