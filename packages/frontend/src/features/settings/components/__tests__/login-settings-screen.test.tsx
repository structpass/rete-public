import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFormColumn } from '@/test-utils/list-layout';
import type { PasswordPolicyDto, IpWhitelistDto } from '@rete/shared';

// 画面が直接 import する API モジュール（../lib/login-settings-api）をモックし、
// 初回ロード / パスワードポリシー保存（チェック→DTO 写像）/ IP 許可リスト保存（textarea→entries パース）/
// CIDR 不正時の backend エラー表示 / 現在 IP 追加 を検証する。
// 個人 MFA（TwoFactorSection）は別 mfa-api モジュールへ分離・本テストでは未設定状態でモック固定。
const api = vi.hoisted(() => ({
  fetchPasswordPolicy: vi.fn(),
  savePasswordPolicy: vi.fn(),
  fetchIpWhitelist: vi.fn(),
  saveIpWhitelist: vi.fn(),
}));
// 個人 MFA（TwoFactorSection）の API はこのテストの対象外。未設定状態（enabled:false）で固定する。
const mfaApi = vi.hoisted(() => ({
  fetchMfaStatus: vi.fn(),
  setupMfa: vi.fn(),
  confirmMfa: vi.fn(),
  disableMfa: vi.fn(),
  regenerateBackupCodes: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../lib/login-settings-api', () => api);
vi.mock('../../lib/mfa-api', () => mfaApi);
// ── useSession モック（role を外部変数で切り替えられるようにする・set-0057）──
// ADMIN 既定: パスワードポリシー / IP フィルタ両セクション＋全体強制トグルが描画される
// （fetchPasswordPolicy は PasswordPolicySection + MfaEnforcementRow で計 2 回呼ばれる）。
let mockRole = 'ADMIN';
vi.mock('@/features/auth/components/session-provider', () => ({
  useSessionContext: () => ({
    user: { id: 'u1', email: 'admin@rete.local', name: 'Admin', role: mockRole },
    loading: false,
    menuItems: [],
  }),
}));

// ロールをリセットする
beforeEach(() => {
  mockRole = 'ADMIN';
});

vi.mock('react-hot-toast', () => ({ default: toast }));

import { LoginSettingsScreen } from '../login-settings-screen';

const POLICY: PasswordPolicyDto = {
  requireLowercase: true,
  requireUppercase: false,
  requireNumber: true,
  requireSymbol: false,
  minLength: 10,
  mfaEnforced: false,
};

const WHITELIST: IpWhitelistDto = {
  entries: [
    { id: 'e1', cidr: '203.0.113.0/24', note: '本社' },
    { id: 'e2', cidr: '198.51.100.42/32', note: '' },
  ],
  currentIp: '203.0.113.42',
};

const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mfaApi.fetchMfaStatus.mockResolvedValue({ enabled: false, confirmedAt: null });
  api.fetchPasswordPolicy.mockResolvedValue({ ...POLICY });
  api.savePasswordPolicy.mockResolvedValue({ ...POLICY });
  api.fetchIpWhitelist.mockResolvedValue({
    ...WHITELIST,
    entries: WHITELIST.entries.map((e) => ({ ...e })),
  });
  api.saveIpWhitelist.mockResolvedValue({
    ...WHITELIST,
    entries: WHITELIST.entries.map((e) => ({ ...e })),
  });
});

/** 画面を描画し、両セクションの初回ロード完了（現在 IP 反映）まで待つ。 */
async function renderLoaded() {
  render(<LoginSettingsScreen />);
  await screen.findByLabelText('IP 許可リスト');
  await waitFor(() => expect(api.fetchIpWhitelist).toHaveBeenCalledTimes(1));
}

describe('LoginSettingsScreen 初回ロード', () => {
  it('パスワードポリシーと IP 許可リストを取得して描画する', async () => {
    await renderLoaded();
    // ADMIN では PasswordPolicySection + MfaEnforcementRow の 2 箇所からロードする。
    expect(api.fetchPasswordPolicy).toHaveBeenCalledTimes(2);
    // チェック状態が DTO を反映（小文字 ON / 大文字 OFF）。
    expect(screen.getByRole('checkbox', { name: /小文字英字/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /大文字英字/ })).not.toBeChecked();
    expect(screen.getByLabelText('最小桁数')).toHaveValue(10);
    // textarea は entries を "CIDR,備考" 形式へ直列化（備考空は CIDR のみ）。
    expect(screen.getByLabelText('IP 許可リスト')).toHaveValue(
      '203.0.113.0/24,本社\n198.51.100.42/32',
    );
  });

  it('PageTitle 説明は出さず、最小桁数入力は数値標準幅 4rem（set-0093 / set-0113）', async () => {
    await renderLoaded();
    expect(screen.getByRole('heading', { name: 'ログイン設定' })).toBeInTheDocument();
    expect(
      screen.queryByText('パスワード強度・二段階認証・接続元 IP 制限を一括管理'),
    ).not.toBeInTheDocument();
    const minLen = screen.getByLabelText('最小桁数');
    expect(minLen).toHaveStyle({ width: '4rem' });
    // 右隣「桁以上」は残る
    expect(screen.getByText('桁以上')).toBeInTheDocument();
  });

  it('フォームカードが内容に合う幅の枠に収まる（v2-180）', async () => {
    await renderLoaded();
    // 全幅(1153px)のままだと入力欄と本文が離れて間延びするため、表のある画面と同じ 680px の枠へ入れる。
    expect(getFormColumn(document.body)?.style.maxWidth).toBe('680px');
  });

  it('ロード失敗時はエラートーストを出す', async () => {
    api.fetchPasswordPolicy.mockRejectedValueOnce(new Error('boom'));
    render(<LoginSettingsScreen />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('パスワードポリシーの読み込みに失敗しました'),
    );
  });
});

/**
 * パスワードポリシー／IP フィルタ／MFA 未設定時のセットアップの3ボタンがいずれも
 * アクセシブル名「保存」を共有するため、インデックス依存でなく各 FormCard セクション
 * （見出しテキストで特定）にスコープして保存ボタンを取得する（set-0095 / set-0131 是正）。
 */
function sectionSaveButton(sectionTitle: string) {
  const heading = screen.getByRole('heading', { name: sectionTitle });
  const section = heading.closest('section') as HTMLElement;
  return within(section).getByRole('button', { name: '保存' });
}

const passwordPolicySaveButton = () => sectionSaveButton('パスワードポリシー');
const ipFilterSaveButton = () => sectionSaveButton('IP アドレスフィルタ');

describe('パスワードポリシー保存', () => {
  it('チェック変更を DTO へ写像して savePasswordPolicy を呼ぶ', async () => {
    await renderLoaded();
    const user = setupUser();
    await user.click(screen.getByRole('checkbox', { name: /大文字英字/ })); // OFF → ON
    await user.click(passwordPolicySaveButton());
    expect(api.savePasswordPolicy).toHaveBeenCalledWith({
      requireLowercase: true,
      requireUppercase: true,
      requireNumber: true,
      requireSymbol: false,
      minLength: 10,
      // 保存は読込んだポリシー全体を全置換 PUT するため mfaEnforced も含めて送る（全体強制トグルと同 singleton）。
      mfaEnforced: false,
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('パスワードポリシーを保存しました'),
    );
  });

  it('保存失敗時はエラートーストを出す', async () => {
    api.savePasswordPolicy.mockRejectedValueOnce(new Error('boom'));
    await renderLoaded();
    const user = setupUser();
    await user.click(passwordPolicySaveButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('パスワードポリシーの保存に失敗しました'),
    );
  });
});

describe('IP 許可リスト保存', () => {
  it('textarea を entries にパースして saveIpWhitelist を呼ぶ', async () => {
    await renderLoaded();
    const user = setupUser();
    const ta = screen.getByLabelText('IP 許可リスト');
    await user.clear(ta);
    await user.type(ta, '10.0.0.0/8,社内LAN');
    await user.click(ipFilterSaveButton());
    expect(api.saveIpWhitelist).toHaveBeenCalledWith({
      entries: [{ cidr: '10.0.0.0/8', note: '社内LAN' }],
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('IP フィルタを保存しました'));
  });

  it('CIDR 不正で backend が拒否した時は backend メッセージをトーストに出す', async () => {
    api.saveIpWhitelist.mockRejectedValueOnce({
      response: { data: { error: { message: '不正な CIDR です: bad' } } },
    });
    await renderLoaded();
    const user = setupUser();
    await user.click(ipFilterSaveButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('不正な CIDR です: bad'));
  });

  it('DTO バリデーション失敗（generic message + details）は意味ある検証メッセージを出す', async () => {
    api.saveIpWhitelist.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'Validation failed',
            details: {
              validationErrors: ['cidr は有効な CIDR（例: 203.0.113.0/24）ではありません'],
            },
          },
        },
      },
    });
    await renderLoaded();
    const user = setupUser();
    await user.click(ipFilterSaveButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'cidr は有効な CIDR（例: 203.0.113.0/24）ではありません',
      ),
    );
  });

  it('「現在 IP を追加」で検出 currentIp/32 を末尾行に追記する', async () => {
    await renderLoaded();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: '現在 IP を追加' }));
    expect(screen.getByLabelText('IP 許可リスト')).toHaveValue(
      '203.0.113.0/24,本社\n198.51.100.42/32\n203.0.113.42/32,自分の現在 IP',
    );
  });
});

describe('MEMBER アクセス制御（set-0057）', () => {
  it('MEMBER には管理セクションを出さず個人 MFA のみ示し、管理系フェッチを行わない', async () => {
    mockRole = 'MEMBER';
    render(<LoginSettingsScreen />);
    // 個人設定（TwoFactorSection）は MEMBER でも表示される。
    // FormCard の h3 はバッジ（有効/無効）込みのアクセシブル名になるため部分一致で引く。
    expect(screen.getByRole('heading', { name: /二段階認証（認証アプリ）/ })).toBeInTheDocument();
    // 管理者専用セクションは描画されない。
    expect(screen.queryByRole('heading', { name: 'パスワードポリシー' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('IP 許可リスト')).not.toBeInTheDocument();
    // 管理系の初期フェッチも発火しない。
    await waitFor(() => expect(mfaApi.fetchMfaStatus).toHaveBeenCalledTimes(1));
    expect(api.fetchPasswordPolicy).not.toHaveBeenCalled();
    expect(api.fetchIpWhitelist).not.toHaveBeenCalled();
  });
});
