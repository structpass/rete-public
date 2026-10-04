import type { ProjectDto } from '@rete/shared';
import type { ProjectRow } from './repositories/projects.repository';

/**
 * ProjectRow（select 済エンティティ）→ ProjectDto（§1 DTO 境界・純粋関数）。
 * archivedAt != null を archived: boolean に畳む。
 * canManageChannels は閲覧者依存の派生値のため service が判定して渡す（既定 false）。
 */
export function toProjectDto(row: ProjectRow, canManageChannels = false): ProjectDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    sortOrder: row.sortOrder,
    archived: row.archivedAt != null,
    canManageChannels,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
