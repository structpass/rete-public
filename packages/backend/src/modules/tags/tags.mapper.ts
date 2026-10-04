import type { Tag } from '@prisma/client';
import type { TagDto } from '@rete/shared';

/**
 * Tag Entity → TagDto（§1 DTO 境界・純粋関数 / rete-files-0006）。
 * マスタ一覧（GET /tags）と一覧のタグ列（files.mapper.toFileRow）が本変換を共有する（重複実装の禁止・§3）。
 * createdAt / updatedAt は表示・付与に不要なため DTO へ載せない。
 * archived は archivedAt 非 null を畳んだ計算値（fil-0094・toAnnouncementTagDto と同型）。生の archivedAt は公開しない。
 */
export function toTagDto(tag: Tag): TagDto {
  return {
    id: tag.id,
    name: tag.name,
    icon: tag.icon,
    color: tag.color,
    archived: tag.archivedAt != null,
  };
}
