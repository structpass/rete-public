import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { flush } from '@/test-utils/flush';
import { AcceptView } from '../accept-view';

// ── next/navigation: ?token= を固定で返す ──
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (k: string) => (k === 'token' ? 'valid-token' : null) }),
}));

// ── acceptInvite モック（cmn-0142: vi.hoisted 化）──
const { mockAccept } = vi.hoisted(() => ({ mockAccept: vi.fn() }));
vi.mock('@/features/settings/lib/invites-api', () => ({
  acceptInvite: (token: string, name: string, password: string) =>
    mockAccept(token, name, password),
}));

// ── usePasswordPolicy: mount 時の /settings/login/password-policy 取得が実 XHR で飛んでいたため
// モック（cmn-0420・change-password-view.test と同型。ポリシー評価自体は本テストの関心外）──
vi.mock('@/features/auth/hooks/use-password-policy', () => ({
  usePasswordPolicy: () => ({ rules: [], allSatisfied: true, policyLoaded: true }),
}));

// ── apiErrorMessage: error.message を素直に取り出す（axios 依存を切る）──
vi.mock('@/features/settings/lib/api-error', () => ({
  apiErrorMessage: (err: unknown, fallback: string) => {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
      ?.error?.message;
    return typeof msg === 'string' && msg.length > 0 ? msg : fallback;
  },
}));

/** 受諾フォームを有効入力で埋めて送信する（FormField が label に "*必須" を付すため id 引き）。 */
async function fillAndSubmit(container: HTMLElement) {
  const set = (id: string, value: string) =>
    fireEvent.change(container.querySelector(`#${id}`) as HTMLInputElement, { target: { value } });
  set('accept-name', '山田 太郎');
  set('accept-password', 'Password1!');
  set('accept-confirm-password', 'Password1!');
  fireEvent.click(screen.getByRole('button', { name: 'アカウント作成' }));
  await flush();
}

describe('AcceptView — 受諾失敗のメッセージ出し分け（code-review HIGH 回帰）', () => {
  beforeEach(() => {
    mockAccept.mockReset();
  });

  it('422（パスワードポリシー違反）はサーバ文言を表示し、再送依頼導線は出さない', async () => {
    mockAccept.mockRejectedValue({
      response: { status: 422, data: { error: { message: 'パスワードには記号を含めてください' } } },
    });
    const { container } = render(<AcceptView />);
    await fillAndSubmit(container);

    expect(screen.getByText('パスワードには記号を含めてください')).toBeInTheDocument();
    // 再送依頼へ化けさせない（パスワードを直す場面）。
    expect(screen.queryByText(/招待メールの再送を依頼/)).not.toBeInTheDocument();
    expect(screen.queryByText(/無効か期限切れ/)).not.toBeInTheDocument();
  });

  it('無効/期限切れ（その他エラー）は統一メッセージ＋再送依頼導線を出す（論点3・列挙防止）', async () => {
    mockAccept.mockRejectedValue({
      response: { status: 400, data: { error: { message: '招待が無効か期限切れです' } } },
    });
    const { container } = render(<AcceptView />);
    await fillAndSubmit(container);

    expect(
      screen.getByText('この招待は無効か期限切れです。管理者に再送を依頼してください。'),
    ).toBeInTheDocument();
    expect(screen.getByText(/招待メールの再送を依頼/)).toBeInTheDocument();
  });

  it('429（throttle）は専用メッセージで、再送依頼導線は出さない', async () => {
    mockAccept.mockRejectedValue({ response: { status: 429 } });
    const { container } = render(<AcceptView />);
    await fillAndSubmit(container);

    expect(screen.getByText(/リクエストが多すぎます/)).toBeInTheDocument();
    expect(screen.queryByText(/招待メールの再送を依頼/)).not.toBeInTheDocument();
  });
});
