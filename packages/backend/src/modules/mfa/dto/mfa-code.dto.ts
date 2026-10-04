import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { MfaCodeInput } from '@rete/shared';

/**
 * TOTP コード（6 桁）または バックアップコードを受ける共通入力 DTO。
 * confirm / disable / login/mfa で共用する。長さは TOTP(6) と backup(10) の双方を許容するため最大 64 で緩く弾く
 * （厳密な照合は service で TOTP→バックアップコードの順に行う）。
 */
export class MfaCodeDto implements MfaCodeInput {
  @ApiProperty({ description: '認証アプリの 6 桁コード、または発行済みバックアップコード' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(64)
  code!: string;
}
