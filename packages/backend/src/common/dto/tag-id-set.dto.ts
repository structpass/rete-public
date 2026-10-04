import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 1 対象（ファイル/フォルダ/お知らせ）へ同時付与できるタグ数の上限（一覧チップの破綻と過大ペイロードを防ぐ）。
 * cmn-0044: files/dto から common/dto へ移設（announcement が files/dto へ reach-in していた §3 予告債務を解消）。
 */
export const TAG_ASSIGN_MAX = 50;

/**
 * タグ集合の全置換入力の共通基底（PUT .../tags）。tagIds は付与後の「完全な集合」（全置換セマンティクス）。
 * 空配列で全解除。各要素は実在タグの UUID（実在検証は service 層）。重複は service で畳む。
 * file（SetFileTagsDto）/ folder（SetFolderTagsDto）/ announcement（SetAnnouncementTagsDto）が本基底を共有する
 * （§3 コピペ回避 / rete-files-0033 / cmn-0036）。
 */
export class TagIdSetDto {
  @ApiProperty({
    description: '付与後のタグ ID 集合（全置換。空配列で全解除）',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(TAG_ASSIGN_MAX)
  @IsUUID('all', { each: true })
  tagIds!: string[];
}
