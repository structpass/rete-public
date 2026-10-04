import type { InviteDto, InviteStatus as InviteEffectiveStatus } from '@rete/shared';
import { InviteStatus } from '@prisma/client';
import type { InviteWithRelationsPublic } from './repositories/invite.repository';

/**
 * Invite Entity（select 済・invitedBy.name 込み）→ InviteDto（§1 DTO 境界・純粋関数）。
 *
 * セキュリティ:
 *  - InviteWithRelationsPublic（tokenHash なし）を受け取るため、mapper 層でも tokenHash を参照不可。
 *    repository 層（inviteSelectPublic）と mapper 層の両方で tokenHash を排除する多層防御。
 *  - effective status: DB status=PENDING かつ expiresAt < now → 表示上 'EXPIRED' に変換する。
 *    DB に EXPIRED を書き込まなくても一覧の表示は正しくなる（クリーンアップジョブ不要の意図設計）。
 */
export function toInviteDto(invite: InviteWithRelationsPublic): InviteDto {
  return {
    id: invite.id,
    email: invite.email,
    status: resolveEffectiveStatus(invite.status, invite.expiresAt),
    invitedAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    invitedByName: invite.invitedBy.name,
  };
}

/**
 * effective status を算出する。
 * PENDING + expiresAt < now → EXPIRED（表示用の derived 状態）。
 * その他は DB 保存値をそのまま返す。
 */
function resolveEffectiveStatus(dbStatus: InviteStatus, expiresAt: Date): InviteEffectiveStatus {
  if (dbStatus === InviteStatus.PENDING && expiresAt < new Date()) {
    return 'EXPIRED';
  }
  // Prisma InviteStatus enum 値と共有 InviteStatus（InviteEffectiveStatus・InviteDto.status の
  // 文字列 union）は同一値のため直接キャストできる（set-0143: 生リテラル union を shared 参照へ）。
  return dbStatus as InviteEffectiveStatus;
}
