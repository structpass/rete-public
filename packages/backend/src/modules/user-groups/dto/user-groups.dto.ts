import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MembershipScopeType } from '@rete/shared';

/** ユーザーグループ作成 DTO（POST /user-groups・システム ADMIN のみ）。 */
export class CreateUserGroupDto {
  @ApiProperty({ description: 'グループ名（表示名）' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

/** ユーザーグループ更新 DTO（PATCH /user-groups/:id・システム ADMIN のみ）。 */
export class UpdateUserGroupDto {
  @ApiProperty({ description: 'グループ名（表示名）', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}

/** グループメンバー追加 DTO（POST /user-groups/:id/members・システム ADMIN のみ）。 */
export class AddUserGroupMemberDto {
  @ApiProperty({ description: '追加するアカウント ID (UUID)' })
  @IsUUID()
  accountId: string;
}

/** グループ grant 付与 DTO（POST /user-groups/:id/grants・システム ADMIN のみ）。 */
export class AddUserGroupScopeGrantDto {
  @ApiProperty({
    enum: ['ORGANIZATION', 'PROJECT', 'CHANNEL'],
    description: 'grant スコープ種別（ORGANIZATION / PROJECT / CHANNEL）',
  })
  @IsIn(['ORGANIZATION', 'PROJECT', 'CHANNEL'])
  scopeType: MembershipScopeType;

  @ApiProperty({
    description:
      'スコープ対象 ID（Organization.id / Project.id / Channel Space.id・archived 不可）',
  })
  @IsUUID()
  scopeId: string;

  @ApiProperty({
    enum: ['ADMIN', 'MEMBER'],
    description: 'スコープ内ロール（グループメンバーへ与える実効ロール）',
  })
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
