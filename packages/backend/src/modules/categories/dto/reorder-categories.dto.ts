import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 分類の並び替えリクエスト（PATCH /categories/reorder / rete-desk-0197・0199）。
 * orderedIds は当該 Space の「全カテゴリ id」を表示順に並べた完全列（部分並び替えは不可）。
 * service が「当該 Space の id 集合と完全一致」を検証し、別 Space の id 混入・欠落・重複を拒否する
 * （IDOR / 不整合防止）。検証通過後、index 順に sortOrder = index + 1（1 始まり）へ一括設定する。
 */
export class ReorderCategoriesDto {
  @ApiProperty({ description: '対象の器（Space）ID（rete-desk-0158・Space スコープ・必須）' })
  @IsUUID()
  @IsNotEmpty()
  spaceId: string;

  @ApiProperty({
    description: '表示順に並べた当該 Space の全カテゴリ id（1 始まりで sortOrder を振り直す）',
    type: [Number],
    example: [3, 1, 2],
  })
  // 1 チャネルあたりの分類数は実運用で十数件規模。一括 UPDATE の DB 負荷上限として 500 件で頭打ち。
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  orderedIds: number[];
}
