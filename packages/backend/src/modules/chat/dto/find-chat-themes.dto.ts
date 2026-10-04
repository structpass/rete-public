import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ChatThemeStatus } from '@rete/shared';
import { MAX_MENTION_IDS } from '../../../common/mentions';

/** query の配列パラメータを正規化する（単一値 `?k=a` は [a]、未指定は undefined / rete-desk-0049）。 */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? (value as string[]) : [value as string];
};

/** query のブールパラメータを正規化する（`?k=true` のみ true、未指定/その他は undefined）。 */
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  return value === 'true' || value === true;
};

export class FindChatThemesDto {
  @IsOptional()
  @IsEnum(ChatThemeStatus)
  status?: ChatThemeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  // 器（Space）絞り込み（CM-2 スライスB / ADR 0037 §7）。指定時はその器に属すテーマのみ返す。
  // 任意パラメータ（未指定＝全件＝従来どおり）＝安全な中断点を維持する。frontend がチャネル選択で渡す。
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  // アーカイブ絞り込み（rete-desk-0061 を server 化）。未指定/false = アーカイブ済を除外（既定）、
  // true = アーカイブ済のみ表示。チャット明細のクライアント絞り込みを server へ寄せた（A案）。
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archiveOnly?: boolean;

  // 顛末絞り込み（rete-desk-0050 を server 化）。true = 顛末記録済（tenmatsu 非 NULL）のテーマのみ。
  // partial index（chat_themes.tenmatsu WHERE NOT NULL）が効く前提。
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  tenmatsuOnly?: boolean;

  // メンション From（発信者）絞り込み（複数 = OR / rete-desk-0049）。値は Account.id。
  // 上限 + UUID 形式で巨大配列 / 不正値の流入を遮断する（posting の宛先と共通の上限）。
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  mentionFrom?: string[];

  // メンション To（宛先）絞り込み（複数 = OR / rete-desk-0049）。From と併用時は同一メッセージ AND。
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  mentionTo?: string[];

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
}
