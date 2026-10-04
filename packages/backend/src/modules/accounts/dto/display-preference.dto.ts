import { IsBoolean, IsString, Matches } from 'class-validator';
import { STRIPE_COLOR_PATTERN } from '@rete/shared';

/**
 * 表示個人設定（明細の縞模様）の更新リクエスト（PUT /accounts/me/display-preference / mdl-0022）。
 * 縞色は @rete/shared の SSOT（#RRGGBB 6 桁 hex）を frontend 入力検証と共有し、CSS 変数へ
 * そのまま流し込める値だけを backend でも硬化する（style injection の芽を形式で塞ぐ）。
 */
export class UpdateDisplayPreferenceDto {
  @IsBoolean()
  stripeEnabled!: boolean;

  @IsString()
  @Matches(STRIPE_COLOR_PATTERN, { message: 'stripeColor must be #RRGGBB (6-digit hex)' })
  stripeColor!: string;
}
