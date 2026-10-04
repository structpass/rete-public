import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './repositories/organizations.repository';
import { MembershipsModule } from '../memberships/memberships.module';

/**
 * 組織管理モジュール（CM-2 / ADR 0037）。
 * MembershipsModule を import して MembershipsRepository（ADMIN 権限チェック用）を注入する。
 */
@Module({
  imports: [MembershipsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository],
  exports: [OrganizationsRepository],
})
export class OrganizationsModule {}
