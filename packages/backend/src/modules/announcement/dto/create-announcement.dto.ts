import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ANNOUNCEMENT_KINDS, AnnouncementKind } from '@rete/shared';

/** 新規通知の作成入力（新規作成オーバーレイ）。body はリッチテキスト HTML（service で sanitize）。 */
export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** 種別（hom-0072）。'board'=掲示板 / 'faq'=FAQ。省略時は'board'。 */
  @IsOptional()
  @IsIn(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind = 'board';

  /** 本文（RTE HTML）。未入力（タイトルのみの短い通知）も許容。 */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;
}
