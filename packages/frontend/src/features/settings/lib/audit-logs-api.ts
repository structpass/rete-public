import apiClient from '@/lib/api-client';
import type {
  AuditLogCursors,
  AuditLogDto,
  AuditLogPageResponse,
  AuditLogQuery,
  PaginationMeta,
} from '@rete/shared';

/**
 * 操作ログ / 監査（ST-6）の API クライアント。backend `api/v1/audit-logs`（ADMIN 限定）に接続する。
 * 件数が膨大になりうるためフィルタ + keyset カーソルページングはサーバー側で行い、画面はカーソル/方向を
 * 渡して該当ページを受け取る（set-0013・OFFSET は使わない）。
 * 画面 ViewModel は shared AuditLogDto と同形のため変換は恒等（DTO 境界は backend 側で確定済み §5）。
 */

/** undefined / 空文字を除いたクエリパラメータへ畳む（空フィルタを ?key= で送らない）。 */
function toParams(query: AuditLogQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  if (query.search?.trim()) params.search = query.search.trim();
  if (query.actionType) params.actionType = query.actionType;
  if (query.systemId) params.systemId = query.systemId;
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.cursor) params.cursor = query.cursor;
  if (query.direction) params.direction = query.direction;
  return params;
}

/** 操作ログ検索（GET /audit-logs・createdAt 降順）→ 該当ページ + meta + 前後移動用カーソル。 */
export async function fetchAuditLogs(
  query: AuditLogQuery,
): Promise<{ data: AuditLogDto[]; meta: PaginationMeta; cursors: AuditLogCursors }> {
  const res = await apiClient.get<AuditLogPageResponse>('/audit-logs', {
    params: toParams(query),
  });
  return { data: res.data.data, meta: res.data.meta, cursors: res.data.cursors };
}

/**
 * 操作ログ CSV エクスポート（GET /audit-logs/export・UTF-8 BOM 付き text/csv）→ Blob。
 * 期間（from / to）必須・最大 92 日は backend が検証する。現在のフィルタはそのまま反映される。
 */
export async function downloadAuditLogsCsv(query: AuditLogQuery): Promise<Blob> {
  const res = await apiClient.get('/audit-logs/export', {
    params: toParams(query),
    responseType: 'blob',
  });
  return res.data as Blob;
}
