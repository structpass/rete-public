import apiClient from '@/lib/api-client';
import { ApiResponse } from '@rete/shared';
import type { AccountResponseDto } from '@rete/shared';

/**
 * ログインユーザーの公開 shape。形の正本は @rete/shared の AccountResponseDto（v2-245 で集約）で、
 * 本名は画面側の既存参照を保つための別名。mfaSetupRequired / mustChangePassword の意味は
 * shared 側のコメント（set-0032 / set-0035）を参照。
 */
export type AccountResponse = AccountResponseDto;

/**
 * backend `POST /auth/login` の生レスポンス形（R7/R8）。
 * - MFA 無効: AccountResponse をそのまま返す（full session 確立済）。
 * - MFA 有効: `{ mfaRequired: true }`（full session 未確立・2 段階目が必要）。
 * - enforced かつ MFA 未設定: AccountResponse + `{ mfaSetupRequired: true }`（session 確立済・設定誘導）。
 */
type LoginRaw =
  | AccountResponse
  | { mfaRequired: true }
  | (AccountResponse & { mfaSetupRequired: true });

/** ログイン結果（呼び出し側が分岐するための判別ユニオン）。 */
export type LoginResult =
  | { kind: 'ok'; account: AccountResponse }
  | { kind: 'mfaRequired' }
  | { kind: 'mfaSetupRequired'; account: AccountResponse };

/**
 * email + password でログインする。失敗時は axios error（401）を throw。
 * MFA 有効アカウントは full session を確立せず `mfaRequired` を返す（呼び出し側で 2 段階目 {@link loginMfa} へ）。
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await apiClient.post<ApiResponse<LoginRaw>>('/auth/login', {
    email,
    password,
  });
  const data = res.data.data;
  if ('mfaRequired' in data) return { kind: 'mfaRequired' };
  if ('mfaSetupRequired' in data) {
    const { mfaSetupRequired: _omit, ...account } = data;
    return { kind: 'mfaSetupRequired', account };
  }
  return { kind: 'ok', account: data };
}

/**
 * MFA チャレンジ（2 段階目）。先行 login で確立した pending session に対し TOTP/バックアップコードを送り、
 * 成功で full session を確立してアカウントを返す。失敗時は axios error（401・MFA_INVALID_CODE / MFA_REQUIRED）。
 */
export async function loginMfa(code: string): Promise<AccountResponse> {
  const res = await apiClient.post<ApiResponse<AccountResponse>>('/auth/login/mfa', { code });
  return res.data.data;
}

/**
 * 現在のログインユーザー。未ログインは 200 + data:null（401 にしない / rete-files-0024）。
 * 401 を投げないのは status-check endpoint であり、未ログインが正常状態のため
 * （ブラウザの console error → Next dev tools「N Issues」累積を避ける）。
 */
export async function fetchMe(): Promise<AccountResponse | null> {
  const res = await apiClient.get<ApiResponse<AccountResponse | null>>('/auth/me');
  return res.data.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

/**
 * 自己パスワード変更（強制変更フローの完了・set-0035）。
 * 現在PW不一致は 401、ポリシー違反/現在PWと同一は 422 を throw（呼び出し側がメッセージを表示）。
 * 成功で backend が mustChangePassword を落とすため、呼び出し側は context の同フラグも false に更新する。
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', { currentPassword, newPassword });
}

/**
 * OIDC interaction（RP authorize 中）のログインを完了する。
 * 戻り値 redirectTo へブラウザ遷移すると provider が authorize を再開する。
 */
export async function completeInteractionLogin(
  uid: string,
  email: string,
  password: string,
): Promise<{ kind: 'redirect'; redirectTo: string } | { kind: 'mfaRequired' }> {
  const res = await apiClient.post<ApiResponse<{ redirectTo: string } | { mfaRequired: true }>>(
    `/auth/interaction/${encodeURIComponent(uid)}/login`,
    { email, password },
  );
  return 'mfaRequired' in res.data.data
    ? { kind: 'mfaRequired' }
    : { kind: 'redirect', redirectTo: res.data.data.redirectTo };
}

/** Complete the second factor for the same OIDC interaction and account as the first-factor request. */
export async function completeInteractionMfa(
  uid: string,
  code: string,
): Promise<{ redirectTo: string }> {
  const res = await apiClient.post<ApiResponse<{ redirectTo: string }>>(
    `/auth/interaction/${encodeURIComponent(uid)}/login/mfa`,
    { code },
  );
  return res.data.data;
}

/**
 * uid 付き interaction を「現在の Rete セッション」で完了する（パスワード不要のシームレス SSO）。
 * 未ログインなら apiClient が 401 を throw する。成功時は provider の authorize 再開 URL を返す。
 */
export async function completeInteractionFromSession(uid: string): Promise<{ redirectTo: string }> {
  const res = await apiClient.post<ApiResponse<{ redirectTo: string }>>(
    `/auth/interaction/${encodeURIComponent(uid)}/session-login`,
    {},
  );
  return res.data.data;
}
