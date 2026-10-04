import type { SpaceDto } from '@rete/shared';
import type { SpaceKind } from '@rete/shared';
import type { SpaceRow } from './repositories/spaces.repository';

/**
 * SpaceRow（select 済エンティティ）→ SpaceDto（§1 DTO 境界・純粋関数）。
 * kind は Prisma enum 文字列から @rete/shared SpaceKind へキャスト（値が完全一致するため安全）。
 * archivedAt != null を archived: boolean に畳む。
 *
 * peerName: PERSONAL_DM の場合のみ viewer 視点で設定（dsk-0325）。他 kind は null。
 * canManageMembers: GROUP のメンバー設定 UI ゲート（dsk-0354）。viewer 依存のため service が判定して渡す（既定 false）。
 * 設定は呼び出し元（service）が viewer 視点で計算して渡す。mapper は受け取った値を素通しするだけ。
 */
export function toSpaceDto(
  row: SpaceRow,
  options?: { peerName?: string | null; canManageMembers?: boolean },
): SpaceDto {
  return {
    id: row.id,
    kind: row.kind as SpaceKind,
    projectId: row.projectId,
    ownerId: row.ownerId,
    peerAccountId: row.peerAccountId,
    name: row.name,
    sortOrder: row.sortOrder,
    archived: row.archivedAt != null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    peerName: options?.peerName ?? null,
    canManageMembers: options?.canManageMembers ?? false,
  };
}
