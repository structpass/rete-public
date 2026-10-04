import apiClient from '@/lib/api-client';
import type {
  ApiResponse,
  IpWhitelistDto,
  IpWhitelistInput,
  PasswordPolicyDto,
  PasswordPolicyInput,
} from '@rete/shared';

/**
 * ログイン設定（ST-2）の API クライアント。backend `api/v1/settings/login`（ADMIN 限定）に接続する。
 * パスワードポリシー（ST-2-1・全体強制 MFA トグル mfaEnforced を含む）と IP 許可リスト（ST-2-3）は
 * 同一ドメイン（login-settings 単一モジュール）のため 1 ファイルに束ねる。
 * 個人 MFA 登録（ST-2-2a・本人のみ）は別 API クライアント [mfa-api.ts] に分離。
 * 画面 ViewModel は shared DTO と同形のため変換は恒等（DTO 境界は backend 側で確定済み §5）。
 */

/** パスワードポリシー取得（GET）。未設定でも backend が既定値を返す。 */
export async function fetchPasswordPolicy(): Promise<PasswordPolicyDto> {
  const res = await apiClient.get<ApiResponse<PasswordPolicyDto>>(
    '/settings/login/password-policy',
  );
  return res.data.data;
}

/** パスワードポリシー更新（PUT・全置換）→ 反映後の値。 */
export async function savePasswordPolicy(input: PasswordPolicyInput): Promise<PasswordPolicyDto> {
  const res = await apiClient.put<ApiResponse<PasswordPolicyDto>>(
    '/settings/login/password-policy',
    input,
  );
  return res.data.data;
}

/** IP 許可リスト取得（GET・検出 currentIp 同梱）。 */
export async function fetchIpWhitelist(): Promise<IpWhitelistDto> {
  const res = await apiClient.get<ApiResponse<IpWhitelistDto>>('/settings/login/ip-whitelist');
  return res.data.data;
}

/** IP 許可リスト更新（PUT・全置換・CIDR は backend で検証）→ 反映後の一覧 + currentIp。 */
export async function saveIpWhitelist(input: IpWhitelistInput): Promise<IpWhitelistDto> {
  const res = await apiClient.put<ApiResponse<IpWhitelistDto>>(
    '/settings/login/ip-whitelist',
    input,
  );
  return res.data.data;
}
