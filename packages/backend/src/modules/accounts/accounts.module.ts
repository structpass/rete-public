import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './repositories/accounts.repository';
import { MembershipsModule } from '../memberships/memberships.module';

/**
 * 担当者候補（AccountSummary）を提供するモジュール。
 * MembershipsModule を import して ScopeVisibilityService を注入し、by-space の可視性検証（非可視は 404 の
 * 存在秘匿・ADR 0038）を service 層で enforce する（categories / chat / tasks / attachments と同方針）。
 */
@Module({
  imports: [MembershipsModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository],
  exports: [AccountsService, AccountsRepository],
})
export class AccountsModule {}
