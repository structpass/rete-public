import { IsIn, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  TAG_COLORS,
  TAG_ICONS,
  TAG_NAME_MAX_LEN,
  type TagColorName,
  type TagIconName,
} from '@rete/shared';

/**
 * タグ作成の入力（POST /tags）。
 * name は 1〜TAG_NAME_MAX_LEN 文字（制御文字除去・前後空白詰めは service 層）。
 * icon は @rete/shared の TAG_ICONS（許可 lucide 名）に限定する（§5 shared 型整合：両側 import）。
 * 任意アイコン名の自由保存を防ぎ、frontend のアイコンレジストリと描画可能集合を一致させる。
 */
export class CreateTagDto {
  @ApiProperty({ description: `タグ名（1〜${TAG_NAME_MAX_LEN} 文字）`, type: String })
  @IsString()
  @Length(1, TAG_NAME_MAX_LEN)
  name!: string;

  @ApiProperty({
    description: 'アイコン名（TAG_ICONS のいずれか / lucide PascalCase）',
    enum: TAG_ICONS,
  })
  @IsString()
  @IsIn(TAG_ICONS, { message: 'icon must be one of the allowed tag icons' })
  icon!: TagIconName;

  @ApiProperty({ description: '色名（TAG_COLORS のいずれか）', enum: TAG_COLORS })
  @IsString()
  @IsIn(TAG_COLORS, { message: 'color must be one of the allowed tag colors' })
  color!: TagColorName;
}
