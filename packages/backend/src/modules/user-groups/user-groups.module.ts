import { Module } from '@nestjs/common';
import { UserGroupsController } from './user-groups.controller';
import { UserGroupsService } from './user-groups.service';
import { UserGroupsRepository } from './repositories/user-groups.repository';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MembershipsModule } from '../memberships/memberships.module';

/**
 * ユーザーグループ管理（set-0164）モジュール。
 * UserGroup / UserGroupMember / UserGroupScopeGrant の 3 テーブルを担う。
 * 全操作はシステム ADMIN 専用（controller の @Roles(Role.ADMIN)）。
 * AuditLogsModule は明示監査行（AuditRecorderService）のため import する。
 * MembershipsModule は実効 ADMIN 全消失ガード（countEffectiveAdmins・3 テーブル横断）のため import する。
 */
@Module({
  imports: [AuditLogsModule, MembershipsModule],
  controllers: [UserGroupsController],
  providers: [UserGroupsService, UserGroupsRepository],
})
export class UserGroupsModule {}
