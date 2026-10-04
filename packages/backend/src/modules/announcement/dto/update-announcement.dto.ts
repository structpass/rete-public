import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

/**
 * 既存通知の編集入力（編集オーバーレイ）。全フィールド任意の部分更新。
 * 指定したフィールドのみ更新し、未指定は既存値を保持する。publishedAt は編集対象外（掲出日時は固定）。
 *
 * 継承方針（cmn-0281）: 通知は「全項目任意」の部分更新のため、PartialType(OmitType(Create, ['kind'])) を採る。
 * kind は create の IsIn 制約を残す＝ PartialType 単独だと update でも kind 送信が受理されてしまい、main.ts:181 の
 * ValidationPipe（whitelist + forbidNonWhitelisted）で従来 400 だった挙動が変わる。Omit で除外して挙動を回帰させない。
 * Create 側の title（任意化されないよう IsNotEmpty が不要になる）が双方向で同値になることは既存 spec で担保済。
 */
export class UpdateAnnouncementDto extends PartialType(
  OmitType(CreateAnnouncementDto, ['kind'] as const),
) {}
