import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { SpacesRepository } from './repositories/spaces.repository';
import { ProjectsModule } from '../projects/projects.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { AccountsModule } from '../accounts/accounts.module';

/**
 * 器（Space / CM-2）管理モジュール。
 * ProjectsModule を import して ProjectsRepository（実在確認）を、
 * MembershipsModule を import して MembershipsRepository（権限チェック）と
 * ScopeVisibilityService（findAll の可視解決）を、
 * AccountsModule を import して AccountsRepository（PERSONAL_DM の peerAccountId 実在確認）を利用する。
 */
@Module({
  imports: [ProjectsModule, MembershipsModule, AccountsModule],
  controllers: [SpacesController],
  providers: [SpacesService, SpacesRepository],
  exports: [SpacesRepository, SpacesService],
})
export class SpacesModule {}
