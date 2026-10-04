import type { Category } from '@prisma/client';
import type { CategoryResponseDto } from './dto/category-response.dto';

/**
 * Category Entity → CategoryResponseDto（§1 DTO 境界）。Date 系は ISO 文字列化する。
 * archived は archivedAt 非 null を畳んで返す（rete-desk-0140）。生の archivedAt は公開しない。
 */
export function toCategoryResponse(entity: Category): CategoryResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    spaceId: entity.spaceId,
    sortOrder: entity.sortOrder,
    archived: entity.archivedAt != null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
