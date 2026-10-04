/**
 * File タブの「送信内容の型」（要求側・SSOT）。
 *
 * 応答契約型（types/files）は cmn-0216 で集約済みのため、本ファイルは要求側（送信ボディ／入力 DTO）の
 * 素の形だけを shared に置く。class-validator / @nestjs/swagger の装飾は backend 側の DTO class が担うため
 * shared には持ち込まない（先例 types/invite / login-settings / mfa と同方針・cmn-0227）。
 *
 * 集約対象外:
 *  - タグ系 DTO（TagIdSetDto へ既に集約済・common/dto/tag-id-set.dto.ts）。
 *  - shape が単純な DTO（CreateFolder / MoveFolder / MoveFile / SearchFilesQuery / TagSearchQuery / BatchAssignTags）。
 *  - frontend の表示用 FileSettingsDto（backend の UpdateFileSettingsDto と必須／任意が逆＝混同を避けるため据え置き）。
 */

/**
 * 設定タブの更新入力（PATCH /files/settings）。各項目とも任意（部分更新）。
 * byteSize の上限は backend の hard cap（UPLOAD_HARD_LIMIT_BYTES）で別途制約、allowedExtensions /
 * rejectedExtensions の `.pdf` 形式チェックも backend 側 class-validator で行う。
 */
export interface UpdateFileSettingsInput {
  maxSizeBytes?: number;
  allowedExtensions?: string[];
  /** 拒否する拡張子（`.pdf` 形式・v2-197）。未指定（undefined）は据え置き、空配列は全解除。 */
  rejectedExtensions?: string[];
}
