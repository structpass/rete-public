import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * 強制パスワード変更（自己変更）の入力（set-0035）。
 * 強度ポリシー検証は service 側で適用中ポリシーに対して行う（DTO では最低限の形式のみ・MaxLength は DoS 抑止）。
 */
export class ChangePasswordDto {
  @ApiProperty({ description: '現在のパスワード（本人確認）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  currentPassword!: string;

  @ApiProperty({ description: '新しいパスワード（適用中のポリシーを満たすこと）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPassword!: string;
}
