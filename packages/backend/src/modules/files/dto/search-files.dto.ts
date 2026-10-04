import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 横断検索の入力（GET /files/search / rete-files-0004）。
 * q はファイル名 / フォルダ名の部分一致クエリ。空 / 未指定は空結果を返す（service 側で trim 判定）。
 * 過大なクエリ文字列による無駄な LIKE 走査を避けるため上限長を設ける。
 */
export class SearchFilesQueryDto {
  @ApiPropertyOptional({
    description: '検索クエリ（ファイル名 / フォルダ名の部分一致）',
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}
