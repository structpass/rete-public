import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './repositories/projects.repository';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MembershipsModule } from '../memberships/memberships.module';

/**
 * プロジェクト管理モジュール（CM-2 / ADR 0037）。
 * OrganizationsModule を import して OrganizationsRepository（実在確認 + 可視 org 解決）を、
 * MembershipsModule を import して MembershipsRepository（ADMIN 権限チェック）を利用する。
 */
@Module({
  imports: [OrganizationsModule, MembershipsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsRepository],
  exports: [ProjectsRepository],
})
export class ProjectsModule {}
