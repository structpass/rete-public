import type { UserFavorite } from '@prisma/client';
import type { FavoriteDto, FavoriteKind } from '@rete/shared';

/**
 * UserFavorite Entity → Response DTO（§1 DTO 境界・純粋関数）。
 * 内部列（accountId / sortOrder / 日時）は公開せず、サイドバー描画に要る最小集合だけを返す。
 * kind は DB 上 String だが、値域は FAVORITE_KINDS（@IsIn で投入時に強制済）のため FavoriteKind へ通す。
 */
export function toFavoriteDto(f: UserFavorite): FavoriteDto {
  return {
    id: f.id,
    kind: f.kind as FavoriteKind,
    targetRef: f.targetRef,
    label: f.label,
  };
}
