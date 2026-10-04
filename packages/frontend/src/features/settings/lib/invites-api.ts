import apiClient from '@/lib/api-client';
import type {
  ApiResponse,
  CreateInviteInput,
  InviteDto,
  InviteImportResultDto,
  MailStatusDto,
} from '@rete/shared';

/**
 * 招待管理（ST-5）の API クライアント。backend `api/v1/invites` に接続する。
 * 認証が必要な操作（一覧/発行/再送/削除/CSV）は ADMIN 限定。受諾のみ公開エンドポイント。
 * パターンは members-api.ts に準拠（fetch base・credentials・共有型）。
 */

/** 招待一覧取得（GET /invites・ADMIN 限定・発行日降順）。 */
export async function fetchInvites(): Promise<InviteDto[]> {
  const res = await apiClient.get<ApiResponse<InviteDto[]>>('/invites');
  return res.data.data;
}

/**
 * メール設定状態取得（GET /invites/mail-status・ADMIN 限定・論点2）。
 * configured=false なら発行 / CSV を事前ブロックし送信失敗エラーに頼らない。
 */
export async function fetchMailStatus(): Promise<MailStatusDto> {
  const res = await apiClient.get<ApiResponse<MailStatusDto>>('/invites/mail-status');
  return res.data.data;
}

/**
 * 招待発行（POST /invites・ADMIN 限定）→ 発行した 1 件。
 * spaceId は受諾時に参加する GROUP Space。
 * 503 = SMTP 未設定 / 400 = 同メールの PENDING 招待が既に存在。
 */
export async function createInvite(input: CreateInviteInput): Promise<InviteDto> {
  const res = await apiClient.post<ApiResponse<InviteDto>>('/invites', input);
  return res.data.data;
}

/** 招待再送（POST /invites/:id/resend・ADMIN 限定）→ 更新後の 1 件。 */
export async function resendInvite(id: string): Promise<InviteDto> {
  const res = await apiClient.post<ApiResponse<InviteDto>>(`/invites/${id}/resend`);
  return res.data.data;
}

/** 招待削除（DELETE /invites/:id・ADMIN 限定）。 */
export async function deleteInvite(id: string): Promise<void> {
  await apiClient.delete(`/invites/${id}`);
}

/**
 * CSV テンプレートダウンロード（GET /invites/csv/template → text/csv 添付）。
 * 一覧 API と異なり生 CSV を返すため responseType:'blob' で受ける。
 */
export async function downloadInviteTemplate(): Promise<Blob> {
  const res = await apiClient.get('/invites/csv/template', { responseType: 'blob' });
  return res.data as Blob;
}

/**
 * CSV 一括インポート（POST /invites/csv/import・multipart/form-data, field名 file）。
 * spaceId はバッチ全行へ同一適用する項目。
 * → issued（発行件数）/ skipped（スキップ件数）/ skippedDetails（行番号 + 理由内訳）を返す。
 */
export async function importInvitesCsv(
  file: File,
  spaceId: string,
): Promise<InviteImportResultDto> {
  const form = new FormData();
  form.append('file', file);
  form.append('spaceId', spaceId);
  const res = await apiClient.post<ApiResponse<InviteImportResultDto>>(
    '/invites/csv/import',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data.data;
}

/**
 * 招待受諾（POST /invites/accept・公開エンドポイント）。
 * 400 = トークン無効 / 期限切れ / email 既存 / PW 短すぎ（同一メッセージ）。
 * 429 = throttle（brute-force 抑制）。
 */
export async function acceptInvite(
  token: string,
  name: string,
  password: string,
): Promise<{ message: string }> {
  const res = await apiClient.post<ApiResponse<{ message: string }>>('/invites/accept', {
    token,
    name,
    password,
  });
  return res.data.data;
}
