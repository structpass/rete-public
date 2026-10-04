import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { flush } from '@/test-utils/flush';
import { LoginForm } from '../login-form';

// cmn-0142: vi.hoisted 化
const {
  mockPush,
  mockLogin,
  mockToastError,
  mockToastSuccess,
  mockInteractionUid,
  mockCompleteInteractionFromSession,
  mockCompleteInteractionLogin,
  mockCompleteInteractionMfa,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockLogin: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockInteractionUid: { value: null as string | null },
  mockCompleteInteractionFromSession: vi.fn(),
  mockCompleteInteractionLogin: vi.fn(),
  mockCompleteInteractionMfa: vi.fn(),
}));

// ── next/navigation: uid 無し（通常ログイン）・router.push を観測 ──
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'uid' ? mockInteractionUid.value : null),
  }),
}));

// ── auth API: login を差し替え（ロックアウト 429 を注入する）──
vi.mock('../../lib/api', () => ({
  login: (email: string, password: string) => mockLogin(email, password),
  loginMfa: vi.fn(),
  completeInteractionFromSession: (uid: string) => mockCompleteInteractionFromSession(uid),
  completeInteractionLogin: (...args: unknown[]) => mockCompleteInteractionLogin(...args),
  completeInteractionMfa: (...args: unknown[]) => mockCompleteInteractionMfa(...args),
}));

// ── session-provider: setUser を no-op に ──
vi.mock('../session-provider', () => ({
  useSessionContext: () => ({ setUser: vi.fn() }),
}));

// ── toast: error/success を観測 ──
vi.mock('react-hot-toast', () => ({
  default: { error: (m: string) => mockToastError(m), success: (m: string) => mockToastSuccess(m) },
}));

async function fillAndSubmit() {
  fireEvent.change(document.querySelector('#email') as HTMLInputElement, {
    target: { value: 'admin@rete.local' },
  });
  fireEvent.change(document.querySelector('#password') as HTMLInputElement, {
    target: { value: 'whatever' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
  await flush();
}

describe('LoginForm — ロックアウト中の文言表示（set-0030）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInteractionUid.value = null;
    mockCompleteInteractionFromSession.mockRejectedValue(new Error('not logged in'));
  });

  it('OIDC interactionでMFAが要求されたらコード入力へ進み、専用endpointを呼ぶ', async () => {
    mockInteractionUid.value = 'oidc-uid';
    mockCompleteInteractionLogin.mockResolvedValue({ kind: 'mfaRequired' });
    mockCompleteInteractionMfa.mockRejectedValue({
      response: { status: 401, data: { error: { message: '認証コードが正しくありません' } } },
    });

    render(<LoginForm />);
    await flush();
    await fillAndSubmit();

    expect(
      screen.getByText('認証アプリの 6 桁コード、またはバックアップコードを入力してください。'),
    ).toBeInTheDocument();
    fireEvent.change(document.querySelector('#mfa-code') as HTMLInputElement, {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '認証' }));
    await flush();

    expect(mockCompleteInteractionLogin).toHaveBeenCalledWith(
      'oidc-uid',
      'admin@rete.local',
      'whatever',
    );
    expect(mockCompleteInteractionMfa).toHaveBeenCalledWith('oidc-uid', '123456');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('429 / TOO_MANY_REQUESTS はロック文言をフォーム上部のアラートに常設表示する（toast にしない）', async () => {
    mockLogin.mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'アカウントがロックされています（自動解除まで約12分）',
            details: { retryAfterMinutes: 12 },
          },
        },
      },
    });

    render(<LoginForm />);
    await fillAndSubmit();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('アカウントがロックされています（自動解除まで約12分）');
    // ロックは継続状態のため toast では出さない（消えないアラートで示す）。
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('ロックアウト以外の認証失敗（401）は従来どおり toast で出し、アラートは出さない', async () => {
    mockLogin.mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: {
            code: 'UNAUTHORIZED',
            message: 'メールアドレスまたはパスワードが正しくありません',
          },
        },
      },
    });

    render(<LoginForm />);
    await fillAndSubmit();

    expect(mockToastError).toHaveBeenCalledWith('メールアドレスまたはパスワードが正しくありません');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
