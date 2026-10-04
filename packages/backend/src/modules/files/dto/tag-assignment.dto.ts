import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TAG_ASSIGN_MAX, TagIdSetDto } from '../../../common/dto';

// cmn-0044: TAG_ASSIGN_MAX / TagIdSetDto は common/dto/tag-id-set.dto へ移設済。
// files/dto としての公開面を保つため再エクスポートする（announcement は common から直接 import する）。
export { TAG_ASSIGN_MAX, TagIdSetDto };

/** 一括付与で同時に指定できる対象（ファイル / フォルダ 各々）の上限（過大ペイロード・暴走 createMany 防止）。 */
export const BATCH_TARGET_MAX = 200;

/** フォルダのタグ付与集合の置換（PUT /files/folders/:id/tags・rete-files-0033・file と同セマンティクス）。 */
export class SetFolderTagsDto extends TagIdSetDto {}

/**
 * 複数ファイル / フォルダへのタグ一括追加 / 解除（POST /files/tags/assign・fil-0048 で add+remove 1tx 対応）。
 * addTagIds / removeTagIds の少なくとも一方が非空であること（両空は service 層で BadRequest）。
 * fileIds / folderIds は少なくとも一方が非空であること（両空は service 層で BadRequest）。
 * addTagIds 省略時は追加なし（解除のみ）、removeTagIds 省略時は解除なし（追加のみ・旧挙動互換）。
 */
export class BatchAssignTagsDto {
  @ApiPropertyOptional({ description: '付与対象ファイル ID 群', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BATCH_TARGET_MAX)
  @IsUUID('all', { each: true })
  fileIds?: string[];

  @ApiPropertyOptional({ description: '付与対象フォルダ ID 群', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BATCH_TARGET_MAX)
  @IsUUID('all', { each: true })
  folderIds?: string[];

  @ApiPropertyOptional({
    description: '追加付与するタグ ID 集合（省略または空配列＝追加なし）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAG_ASSIGN_MAX)
  @IsUUID('all', { each: true })
  addTagIds?: string[];

  @ApiPropertyOptional({
    description: '解除するタグ ID 集合（省略または空配列＝解除なし）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAG_ASSIGN_MAX)
  @IsUUID('all', { each: true })
  removeTagIds?: string[];
}

/**
 * タグ横断検索の入力（GET /files/tags/search・rete-files-0032）。
 * tagIds は繰り返しクエリ（?tagIds=a&tagIds=b）/ カンマ区切り（?tagIds=a,b）/ 単一値のいずれでも受ける。
 * @Transform で string | string[] を string[] に正規化し（空要素は除去）、各要素を UUID 検証する。
 * 未指定 / 空は service が空結果を返す（実在検証はせず寛容に倒す）。
 */
export class TagSearchQueryDto {
  @ApiPropertyOptional({
    description: '絞り込むタグ ID 集合（繰り返し / カンマ区切り / 単一）',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    const raw: unknown[] = Array.isArray(value) ? value : [value];
    return raw
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : v))
      .map((v) => (typeof v === 'string' ? v.trim() : v))
      .filter((v) => typeof v === 'string' && v.length > 0);
  })
  @IsArray()
  @ArrayMaxSize(TAG_ASSIGN_MAX)
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
