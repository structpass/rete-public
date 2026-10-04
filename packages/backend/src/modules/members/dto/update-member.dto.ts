import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * メンバー更新の入力（PATCH /members/:id・部分更新）。項目すべて省略可（全未指定は service が BadRequest）。
 * - familyName / givenName: 姓・名（set-0096）。どちらか指定時は service が name を再組み立て。
 * - isActive: ロック/解除（false=ロック）。自分自身のロックは service が弾く（自己ロックアウト防止）。
 * - email: メールアドレス（=ログイン識別子・set-0097）。service で trim→小文字正規化、既使用値は ConflictException。
 *   session.serializer / OIDC は sub=Account.id のため退行なし（session.serializer.ts:16, oidc-config.factory.ts:102）。
 */
export class UpdateMemberDto {
  @ApiPropertyOptional({ description: '姓', type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  familyName?: string;

  @ApiPropertyOptional({ description: '名（空文字可）', type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  givenName?: string;

  @ApiPropertyOptional({ description: 'ロック/解除（false=ロック）', type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'メールアドレス（=ログイン識別子・set-0097）。service で小文字正規化',
    type: String,
  })
  @IsOptional()
  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  @MaxLength(255)
  email?: string;
}
