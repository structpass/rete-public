import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MembersRepository } from './repositories/members.repository';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MfaModule } from '../mfa/mfa.module';

/**
 * メンバー管理機能（Settings ST-4）。既存 Account に業務ロール割当 + システムアクセスを束ねて
 * 一覧 / 編集する。enforcement（割当に基づく認可）は hardening H4 で別途。
 * AuditLogsModule は システムロール昇格/降格の監査記録（AuditRecorderService）のため import する（cmn-0047）。
 * MfaModule は管理者による MFA 強制リセット（set-0033・MfaService.adminResetMfa）のため import する。
 */
@Module({
  imports: [AuditLogsModule, MfaModule],
  controllers: [MembersController],
  providers: [MembersService, MembersRepository],
})
export class MembersModule {}
