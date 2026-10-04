import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** orderedIds の上限。個人のお気に入りが将来増えても破綻しない緩めの上限で、巨大配列での DoS を防ぐ。 */
const MAX_ORDERED_IDS = 200;

/**
 * お気に入りの並び替え DTO。orderedIds は **現在のお気に入り全件の id を新しい順序で重複なく** 含める。
 * 件数が現存お気に入りと完全一致するかは service 層で検証する（部分集合による sortOrder 不整合を防ぐ）。
 * repository は受け取った id 群の sortOrder を配列位置（index）で更新する（accountId スコープ付き）。
 */
export class ReorderFavoritesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ORDERED_IDS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
