import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ANNOUNCEMENT_KINDS, AnnouncementKind } from '@rete/shared';

/** orderedIds の上限。通知が将来増えても破綻しない緩めの上限で、巨大配列での DoS を防ぐ（favorites と同方針）。 */
const MAX_ORDERED_IDS = 500;

/**
 * 通知の並び替え DTO（H0021 D&D・ADMIN 限定）。orderedIds は **現存する通知全件の id を新しい順序で
 * 重複なく** 含める。件数が現存通知と完全一致するかは service / repository（tx 内）で検証する
 * （部分集合による position 不整合を防ぐ）。repository は受け取った id 群の position を配列位置（index）で更新する。
 * お気に入り（ReorderFavoritesDto）と同型だが、通知は個人データではなくテナント共通のため accountId スコープを持たない。
 */
export class ReorderAnnouncementsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ORDERED_IDS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderedIds!: string[];

  /** 種別（hom-0072）。並び替え対象を kind でスコープする。省略時は'board'。 */
  @IsOptional()
  @IsIn(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind = 'board';
}
