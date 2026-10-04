import type { UserTableColumnWidth } from '@prisma/client';
import type { UserTableColumnWidthResponseDto } from './dto/user-table-column-width-response.dto';

/**
 * UserTableColumnWidth Entity → Response DTO 変換（Tier A passthrough）。
 * userId は自分自身のデータなので返さない。
 * Date は ISO 文字列化してフロントとの型ズレを防ぐ。
 */
export function toUserTableColumnWidthResponse(
  entity: UserTableColumnWidth,
): UserTableColumnWidthResponseDto {
  return {
    tableId: entity.tableId,
    columnKey: entity.columnKey,
    width: entity.width,
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toUserTableColumnWidthResponseList(
  entities: UserTableColumnWidth[],
): UserTableColumnWidthResponseDto[] {
  return entities.map(toUserTableColumnWidthResponse);
}
