import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsRepository } from './repositories/audit-logs.repository';
import { AuditRecorderService } from './audit-recorder.service';
import { AuditLogsPurgeService } from './audit-logs-purge.service';

/**
 * 操作ログ / 監査（Settings ST-6・H5）。
 * - ST-6: 閲覧 / 検索 / CSV 出力（ADMIN 限定・読み取り専用）。
 * - H5: 記録（書き込み）infra（AuditRecorderService）+ retention purge（AuditLogsPurgeService）。
 *
 * AuditRecorderService は AuthModule / AuditLogInterceptor（APP_INTERCEPTOR）が利用するため export する。
 */
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsRepository, AuditRecorderService, AuditLogsPurgeService],
  exports: [AuditRecorderService],
})
export class AuditLogsModule {}
