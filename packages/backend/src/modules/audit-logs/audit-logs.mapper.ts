import type { AuditLog } from '@prisma/client';
import type { AuditActionType, AuditLogDto } from '@rete/shared';

/**
 * 操作ログ Entity → Response DTO 写像（§1 DTO 境界）。
 * 内部列（actorAccountId / systemId / userAgent / details）はレスポンスに載せない（一覧表示に不要・最小境界）。
 * actor / system は記録時のスナップショット列をそのまま使う（account/system 削除後も履歴が壊れない監査の不変性）。
 * actionType は DB 上 String だが値域は記録時に AUDIT_ACTION_TYPES へ強制済みのため AuditActionType として返す。
 */
export function toAuditLogDto(row: AuditLog): AuditLogDto {
  return {
    id: row.id,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    systemName: row.systemName,
    actionType: row.actionType as AuditActionType,
    feature: row.feature,
    summary: row.summary,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
  };
}
