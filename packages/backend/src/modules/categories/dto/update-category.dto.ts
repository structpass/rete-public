import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 分類マスタの更新リクエスト（PATCH /categories/:id / rete-desk-0140）。
 * 名称変更 / 表示順変更 / アーカイブ切替を 1 endpoint に集約する（マスタ管理画面の操作単位が
 * いずれも「1 項目の部分更新」のため、エンドポイントを分けない）。
 */
export class UpdateCategoryDto {
  // @IsOptional は undefined のみスキップし空文字はスキップしないため、name 送信時は @IsNotEmpty が効く
  // （= 省略は許すが「空文字での更新」は弾く）。
  @ApiPropertyOptional({ description: '機能領域分類名', example: '入荷', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  // @Max は int4 上限（2,147,483,647）超で Prisma が未補足 500 を返すのを防ぐ防衛。UI 経路では到達不能。
  @ApiPropertyOptional({ description: '表示順', minimum: 0, maximum: 1_000_000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      'アーカイブ状態（true=アーカイブ / false=解除）。所属タスクはツリー・一覧から非表示になる',
  })
  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}
