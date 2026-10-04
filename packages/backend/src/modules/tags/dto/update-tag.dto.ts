import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TAG_COLORS,
  TAG_ICONS,
  TAG_NAME_MAX_LEN,
  type TagColorName,
  type TagIconName,
} from '@rete/shared';

/**
 * タグ更新の入力（PATCH /tags/:id）。name / icon を部分更新できる（両方省略は service が BadRequest）。
 * 検証規則は CreateTagDto と同一（§5 shared 型整合：TAG_ICONS / TAG_NAME_MAX_LEN を両側 import）。
 * 未指定（undefined）フィールドは service で更新スキップし DB の既存値を保持する。
 */
export class UpdateTagDto {
  @ApiPropertyOptional({ description: `タグ名（1〜${TAG_NAME_MAX_LEN} 文字）`, type: String })
  @IsOptional()
  @IsString()
  @Length(1, TAG_NAME_MAX_LEN)
  name?: string;

  @ApiPropertyOptional({ description: 'アイコン名（TAG_ICONS のいずれか）', enum: TAG_ICONS })
  @IsOptional()
  @IsString()
  @IsIn(TAG_ICONS, { message: 'icon must be one of the allowed tag icons' })
  icon?: TagIconName;

  @ApiPropertyOptional({ description: '色名（TAG_COLORS のいずれか）', enum: TAG_COLORS })
  @IsOptional()
  @IsString()
  @IsIn(TAG_COLORS, { message: 'color must be one of the allowed tag colors' })
  color?: TagColorName;

  /** アーカイブ状態（true=アーカイブ / false=解除・fil-0094。hom-0083 と同方針）。 */
  @ApiPropertyOptional({
    description: 'アーカイブ状態（true=アーカイブ / false=解除）',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
