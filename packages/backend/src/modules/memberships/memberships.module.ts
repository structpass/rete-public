import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MembershipsRepository } from './repositories/memberships.repository';
import { ScopeVisibilityRepository } from './repositories/scope-visibility.repository';
import { ScopeVisibilityService } from './scope-visibility.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

/**
 * メンバーシップ管理（CM-2）モジュール。
 * MembershipsRepository と ScopeVisibilityService を export し、他モジュール
 * （OrganizationsModule / ProjectsModule / SpacesModule）が権限チェック・可視解決に使えるようにする。
 * 循環依存を避けるため、本モジュールは他の CM-2 モジュールを import しない。
 * AuditLogsModule は add のシステム ADMIN バイパス記録（AuditRecorderService）のため import する。
 * ScopeVisibilityRepository は内部利用（service 注入のみ）なので exports には出さない。
 */
@Module({
  imports: [AuditLogsModule],
  controllers: [MembershipsController],
  providers: [
    MembershipsService,
    MembershipsRepository,
    ScopeVisibilityService,
    ScopeVisibilityRepository,
  ],
  exports: [MembershipsRepository, ScopeVisibilityService],
})
export class MembershipsModule {}
