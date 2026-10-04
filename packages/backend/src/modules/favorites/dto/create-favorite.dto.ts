import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  FAVORITE_KINDS,
  FAVORITE_LABEL_MAX_LEN,
  FAVORITE_TARGET_REF_MAX_LEN,
  type FavoriteKind,
} from '@rete/shared';

/**
 * お気に入り追加の入力 DTO。kind は @rete/shared の許可集合で強制（§5 shared 型整合）。
 * targetRef は省略可: manual 追加（種別＋ラベルのみ）では service が合成 id を採番する。
 * ★トグル（HM-1-4）からの追加では実リソース id を渡し、unique 制約で重複登録を冪等化する。
 */
export class CreateFavoriteDto {
  @IsIn(FAVORITE_KINDS)
  kind!: FavoriteKind;

  @IsString()
  @MinLength(1)
  @MaxLength(FAVORITE_LABEL_MAX_LEN)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(FAVORITE_TARGET_REF_MAX_LEN)
  targetRef?: string;
}
