import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import {
  ANNOUNCEMENT_KINDS,
  AnnouncementKind,
  TAG_ICONS,
  TAG_COLORS,
  TAG_NAME_MAX_LEN,
} from '@rete/shared';

export class CreateAnnouncementTagDto {
  /** 種別（hom-0072）。'board'=掲示板 / 'faq'=FAQ。省略時は'board'。 */
  @IsOptional()
  @IsIn(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind = 'board';

  @IsString()
  @Length(1, TAG_NAME_MAX_LEN)
  name: string;

  @IsIn(TAG_ICONS)
  icon: string;

  @IsIn(TAG_COLORS)
  color: string;
}
