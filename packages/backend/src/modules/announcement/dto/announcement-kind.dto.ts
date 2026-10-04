import { IsIn, IsOptional } from 'class-validator';
import { ANNOUNCEMENT_KINDS, AnnouncementKind } from '@rete/shared';

/** kind のみのクエリ DTO（未読数 GET /announcements/unread-count・hom-0072）。未指定は'board'。 */
export class AnnouncementKindQueryDto {
  @IsOptional()
  @IsIn(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind = 'board';
}
