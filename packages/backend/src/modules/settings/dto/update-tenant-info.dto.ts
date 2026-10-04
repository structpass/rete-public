import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_BADGE_COLORS, TENANT_NAME_MAX_LENGTH } from '../settings.constants';

/**
 * テナント情報の部分更新 DTO。未指定フィールドは repository（upsert の update）で更新スキップされ
 * 既存値を保持する（FileSettings の部分 upsert と同方針 / read-modify-write 不要）。
 * name は指定時のみ検証する（@IsOptional）。指定するなら 1〜20 文字（空文字での上書きを禁止）。
 */
export class UpdateTenantInfoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TENANT_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsIn([...TENANT_BADGE_COLORS])
  badgeColor?: string;
}
