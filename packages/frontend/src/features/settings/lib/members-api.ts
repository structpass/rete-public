import apiClient from '@/lib/api-client';
import type { ApiResponse, MemberDto, MemberUpdateInput } from '@rete/shared';

/**
 * メンバー管理（ST-4）の API クライアント。backend `api/v1/members`（ADMIN 限定）に接続する。
 * 画面 ViewModel は MemberDto と同形のため変換は恒等（DTO 境界は backend 側で確定済み・shared 型を両側で共有 §5）。
 * システムタブの列・業務ロール select は tenant 設定（fetchTenantSystems）/ ロール（fetchRoles）を再利用する。
 */

/** メンバー一覧取得（GET /members・作成順・業務ロール + システムアクセス込み）。 */
export async function fetchMembers(): Promise<MemberDto[]> {
  const res = await apiClient.get<ApiResponse<MemberDto[]>>('/members');
  return res.data.data;
}

/** メンバー更新（PATCH /members/:id・ロック/解除・業務ロール割当・システムアクセス全置換）→ 反映後の 1 件。 */
export async function updateMember(id: string, input: MemberUpdateInput): Promise<MemberDto> {
  const res = await apiClient.patch<ApiResponse<MemberDto>>(`/members/${id}`, input);
  return res.data.data;
}

/**
 * ログイン試行ロックアウトの手動即時解除（PATCH /members/:id/unlock）→ 反映後の 1 件。
 * 自動 15 分解除を待たず ADMIN が即座に解除する（lockedUntil/失敗回数クリア・set-0030）。
 */
export async function unlockMember(id: string): Promise<MemberDto> {
  const res = await apiClient.patch<ApiResponse<MemberDto>>(`/members/${id}/unlock`, {});
  return res.data.data;
}

/**
 * 二段階認証（MFA）の管理者強制リセット（PATCH /members/:id/mfa-reset）→ 反映後の 1 件（mfaEnabled=false）。
 * TOTP・バックアップコードを全喪失した利用者を復旧する（リセット後は次回ログインで再設定を要求・set-0033）。
 */
export async function resetMemberMfa(id: string): Promise<MemberDto> {
  const res = await apiClient.patch<ApiResponse<MemberDto>>(`/members/${id}/mfa-reset`, {});
  return res.data.data;
}

/**
 * メンバー一覧 CSV エクスポート（GET /members/export・UTF-8 BOM 付き text/csv）→ Blob。
 * 一覧 API（JSON ApiResponse）と異なり生の CSV を返すため responseType: 'blob' で受ける。
 */
export async function downloadMembersCsv(): Promise<Blob> {
  const res = await apiClient.get('/members/export', { responseType: 'blob' });
  return res.data as Blob;
}
