import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** query のブールパラメータを正規化する（`?k=true` のみ true、未指定/その他は undefined）。 */
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  return value === 'true' || value === true;
};

/**
 * 分類一覧の取得クエリ（GET /categories / rete-desk-0140）。
 * 既定はアーカイブ済を除外（タスクフォームの select / フィルタ用）。
 * includeArchived=true は分類マスタ管理画面専用（アーカイブ済も解除操作のため表示する）。
 */
export class FindCategoriesDto {
  @ApiProperty({ description: '所属する器（Space）ID（rete-desk-0158・Space スコープ・必須）' })
  @IsUUID()
  @IsNotEmpty()
  spaceId: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}
