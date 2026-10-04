import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * グループの並び替え（PATCH /desk-groups/reorder）。同一グループ分類バケット内の並び替えのみ扱う
 * （バケットを跨ぐ移動は PATCH /desk-groups/:id の classificationId 変更が担う）。
 * classificationId は対象バケットの指定（null=未分類バケット）。orderedIds は当該バケットの全グループ id。
 */
export class ReorderDeskGroupsDto {
  @ApiProperty({
    description: '対象バケットのグループ分類 ID（null=未分類バケット）',
    nullable: true,
  })
  @ValidateIf((o) => o.classificationId !== null)
  @IsUUID('4')
  classificationId!: string | null;

  @ApiProperty({ description: '表示順に並べた当該バケットの全グループ id', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
