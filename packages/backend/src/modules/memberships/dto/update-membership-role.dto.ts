import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** メンバーシップ ロール変更 DTO（PATCH /memberships/:id）。 */
export class UpdateMembershipRoleDto {
  @ApiProperty({
    enum: ['ADMIN', 'MEMBER'],
    description: 'スコープ内ロール（ADMIN または MEMBER）',
  })
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
