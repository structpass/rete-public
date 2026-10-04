import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { TAG_ICONS, TAG_COLORS, TAG_NAME_MAX_LEN } from '@rete/shared';

export class UpdateAnnouncementTagDto {
  @IsOptional()
  @IsString()
  @Length(1, TAG_NAME_MAX_LEN)
  name?: string;

  @IsOptional()
  @IsIn(TAG_ICONS)
  icon?: string;

  @IsOptional()
  @IsIn(TAG_COLORS)
  color?: string;

  /** アーカイブ状態（true=アーカイブ / false=解除・hom-0083。Category と同方針）。 */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
