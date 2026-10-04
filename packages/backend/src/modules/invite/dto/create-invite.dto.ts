import { IsEmail, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { CreateInviteInput } from '@rete/shared';

/**
 * 招待発行の入力 DTO（POST /invites）。
 * email の長さは RFC5321 の 254 文字上限に準拠する。
 * spaceId は受諾時に参加する GROUP Space を指定する。
 */
export class CreateInviteDto implements CreateInviteInput {
  @ApiProperty({
    description: '招待先メールアドレス（RFC5321・254 文字以内）',
    example: 'user@example.com',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: '受諾時に追加する GROUP Space ID (UUID)' })
  @IsUUID()
  spaceId!: string;
}
