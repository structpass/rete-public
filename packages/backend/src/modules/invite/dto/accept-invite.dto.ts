import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { AcceptInviteInput } from '@rete/shared';

/**
 * 招待受諾の入力 DTO（POST /invites/accept・公開エンドポイント）。
 *
 * セキュリティ:
 *  - token 長さ制限（512 文字）で過剰入力を弾く（sha256 処理前の防御）。
 *  - password 長さは service 側でポリシーの minLength に照合する（DTO では最大 256 文字のみ制限）。
 *  - パスワード強度（大文字小文字・数字等）はポリシー minLength のみ（受諾 DTO での再バリデーションは行わない）。
 */
export class AcceptInviteDto implements AcceptInviteInput {
  @ApiProperty({ description: '招待リンクに含まれる生トークン', example: 'abc123...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ description: '表示名', example: '山田 太郎' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: 'パスワード（ポリシーの最小桁数以上）', example: 'Password1!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;
}
