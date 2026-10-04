import apiClient from '@/lib/api-client';
import type { ApiResponse, MfaBackupCodesDto, MfaSetupDto, MfaStatusDto } from '@rete/shared';

/**
 * 個人 MFA/TOTP（ST-2-2a）の API クライアント。backend `api/v1/settings/mfa`（ログイン本人のみ）に接続する。
 * 全体強制トグル（ST-2-2b・ADMIN）は password-policy の mfaEnforced に同居するため login-settings-api 側で扱う。
 *
 * セキュリティ境界: secret は授受しない。otpauth URI / バックアップコード平文は backend が「一度だけ」返す。
 */

/** 自分の MFA 状態取得（GET・secret は含まれない）。 */
export async function fetchMfaStatus(): Promise<MfaStatusDto> {
  const res = await apiClient.get<ApiResponse<MfaStatusDto>>('/settings/mfa');
  return res.data.data;
}

/** MFA セットアップ開始（POST）→ QR 用 otpauth URI を一度だけ受け取る（この時点では未確定）。 */
export async function setupMfa(): Promise<MfaSetupDto> {
  const res = await apiClient.post<ApiResponse<MfaSetupDto>>('/settings/mfa/setup', {});
  return res.data.data;
}

/** 初回 TOTP 検証で有効化（POST）→ バックアップコード平文（10 個）を一度だけ受け取る。 */
export async function confirmMfa(code: string): Promise<MfaBackupCodesDto> {
  const res = await apiClient.post<ApiResponse<MfaBackupCodesDto>>('/settings/mfa/confirm', {
    code,
  });
  return res.data.data;
}

/** コード（TOTP or バックアップ）で本人確認して MFA を無効化（POST）。 */
export async function disableMfa(code: string): Promise<void> {
  await apiClient.post('/settings/mfa/disable', { code });
}

/** 本人確認してバックアップコードを再発行（POST）→ 新しい平文配列。旧コードは全失効。 */
export async function regenerateBackupCodes(code: string): Promise<MfaBackupCodesDto> {
  const res = await apiClient.post<ApiResponse<MfaBackupCodesDto>>(
    '/settings/mfa/backup-codes/regenerate',
    { code },
  );
  return res.data.data;
}
