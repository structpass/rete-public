import { IsEnum, IsIn, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MembershipScopeType } from '@rete/shared';

/** メンバーシップ追加 DTO（POST /memberships）。 */
export class AddMembershipDto {
  @ApiProperty({ description: '招待するアカウント ID (UUID)' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ enum: MembershipScopeType, description: 'スコープ種別' })
  @IsEnum(MembershipScopeType)
  scopeType: MembershipScopeType;

  @ApiProperty({ description: 'スコープ対象 ID（org/project/group の id）' })
  @IsUUID()
  scopeId: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER'], description: 'スコープ内ロール' })
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
