import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@rete/shared';

/**
 * システムロール変更 DTO（PATCH /members/:id/system-role・cmn-0047）。
 * Account.role を ADMIN（システム管理者）⇆ MEMBER（一般）へ切り替える。
 * 値域は @rete/shared Role（Prisma enum と SSOT 一致）。降格の全消失ガードは service が担う。
 */
export class SetSystemRoleDto {
  @ApiProperty({ enum: Role, description: 'システムロール（ADMIN=システム管理者 / MEMBER=一般）' })
  @IsIn([Role.ADMIN, Role.MEMBER])
  role: Role;
}
