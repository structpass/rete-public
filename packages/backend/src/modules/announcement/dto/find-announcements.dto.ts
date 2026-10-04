import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ANNOUNCEMENT_KINDS, AnnouncementKind } from '@rete/shared';

/** 一覧取得のクエリ（publishedAt 降順 + ページング）。 */
export class FindAnnouncementsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** 種別（hom-0072）。'board'=掲示板 / 'faq'=FAQ。未指定は既存クライアント互換で'board'。 */
  @IsOptional()
  @IsIn(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind = 'board';
}
