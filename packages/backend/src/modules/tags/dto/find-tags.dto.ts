import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/** query のブールパラメータを正規化する（`?k=true` のみ true、未指定/その他は undefined）。 */
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  return value === 'true' || value === true;
};

/**
 * タグ一覧取得のクエリ（GET /tags・fil-0094）。FindAnnouncementTagsDto と同型（kind スコープは無し）。
 * includeArchived=true はタグ管理画面専用（既定はアーカイブ済を除外・ADMIN のみ許可は controller が担う）。
 */
export class FindTagsDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}
