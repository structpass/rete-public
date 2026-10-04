import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { PasswordPolicyInput } from '@rete/shared';
import { PASSWORD_MIN_LENGTH_CEIL, PASSWORD_MIN_LENGTH_FLOOR } from '../login-settings.constants';

/**
 * パスワードポリシー更新 DTO（PUT /settings/login/password-policy・全置換）。
 * 必須文字種フラグ + 最小桁数（4-64）。全フィールド必須（部分更新ではなく設定の全置換）。
 */
export class UpdatePasswordPolicyDto implements PasswordPolicyInput {
  @ApiProperty({ description: '小文字英字 a-z を必須とする' })
  @IsBoolean()
  requireLowercase: boolean;

  @ApiProperty({ description: '大文字英字 A-Z を必須とする' })
  @IsBoolean()
  requireUppercase: boolean;

  @ApiProperty({ description: '数字 0-9 を必須とする' })
  @IsBoolean()
  requireNumber: boolean;

  @ApiProperty({ description: '記号（英数字以外）を必須とする' })
  @IsBoolean()
  requireSymbol: boolean;

  @ApiProperty({
    description: '最小桁数（4-64）',
    minimum: PASSWORD_MIN_LENGTH_FLOOR,
    maximum: PASSWORD_MIN_LENGTH_CEIL,
  })
  @IsInt()
  @Min(PASSWORD_MIN_LENGTH_FLOOR)
  @Max(PASSWORD_MIN_LENGTH_CEIL)
  minLength: number;

  @ApiProperty({
    description:
      '全体強制 MFA（ON で local 認証の全メンバーが TOTP 設定完了まで保護ルートを遮断される）',
  })
  @IsBoolean()
  mfaEnforced: boolean;
}
