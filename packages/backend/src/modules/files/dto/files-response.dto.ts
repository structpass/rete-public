/**
 * File タブの Response DTO（§1 DTO 境界・cmn-0216 で集約）。
 *
 * 契約形（shape）は @rete/shared の `types/files` を単一ソースとし、本ファイルは同名・同形の別名
 * として再公開する。呼び出し側（mapper / service / controller / 他 dto）の import パスは変えず、
 * shared 集約のコストを吸収する（先例 cmn-0198 / cmn-0211 と同方針）。
 *
 * Prisma Entity を直返しせず本 DTO を経由する。Date 系は mapper で ISO 8601 文字列化、
 * byteSize は数値（フロントで整形）。ディレクトリ単位権限（旧 FB+）は ADR 0063 で全廃し、
 * 権限系 DTO・移行期の互換フィールドも撤去済み（fil-0136 / fil-0139）。
 */

export type {
  FolderTreeNodeDto,
  FolderTreeResponseDto,
  FolderCrumbDto,
  FileRowDto,
  FolderContentResponseDto,
  SearchResultItemDto,
  SearchResponseDto,
  TagSearchResponseDto,
  BatchAssignResultDto,
  MovedFolderResponseDto,
  MovedFileResponseDto,
  CreatedFolderResponseDto,
  FileMetaResponseDto,
} from '@rete/shared';
