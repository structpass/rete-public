import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * グループ分類の並び替え（PATCH /desk-groups/classifications/reorder）。
 * orderedIds は自分の全グループ分類 id を表示順で重複なく含める（部分並び替えは不可）。
 * service が「現存全件と完全一致」を検証し、index 順に sortOrder = index（0 始まり）へ一括設定する。
 */
export class ReorderDeskGroupClassificationsDto {
  @ApiProperty({ description: '表示順に並べた自分の全グループ分類 id', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
