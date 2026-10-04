import type { OrganizationDto } from '@rete/shared';
import type { OrganizationRow } from './repositories/organizations.repository';

/**
 * OrganizationRow（select 済エンティティ）→ OrganizationDto（§1 DTO 境界・純粋関数）。
 * archivedAt != null を archived: boolean に畳む（mapper の責務）。
 */
export function toOrganizationDto(row: OrganizationRow): OrganizationDto {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    archived: row.archivedAt != null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
