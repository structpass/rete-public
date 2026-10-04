import { TAG_ASSIGN_MAX, TagIdSetDto } from './tag-assignment.dto';

/**
 * 1 ファイルへ同時付与できるタグ数の上限（互換エイリアス）。
 * 値の単一ソースは tag-assignment.dto の TAG_ASSIGN_MAX（file / folder 共通の上限）。
 */
export const FILE_TAGS_MAX = TAG_ASSIGN_MAX;

/**
 * ファイルのタグ付与集合の置換入力（PUT /files/files/:id/tags）。
 * 全置換セマンティクス（tagIds = 付与後の完全な集合・空配列で全解除）は基底 TagIdSetDto が定義する
 * （フォルダ版 SetFolderTagsDto と共通・§3 コピペ回避 / rete-files-0033）。
 */
export class SetFileTagsDto extends TagIdSetDto {}
