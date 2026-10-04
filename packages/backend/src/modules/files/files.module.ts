import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FilesRepository } from './repositories/files.repository';
import { StorageService } from './storage/storage.service';
import { LocalFsStorageService } from './storage/local-fs-storage.service';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  // MembershipsModule が ScopeVisibilityService を export する（ADR 0063 で File の可視性判定は
  // 「所属 Space が見えるか」の一本になり、File 専用の ACL 解決器を持たなくなった）。
  // AuditLogsModule は不要になった: files が明示的に監査記録していたのはディレクトリ権限の変更
  // （fil-0100）だけで、権限そのものが無くなったため（一般操作の監査は AuditLogInterceptor が担う）。
  imports: [MembershipsModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    FilesRepository,
    // 実体ストレージは抽象トークン経由で注入。差し替え（S3 等）は本 binding を変えるだけ（operational-policy §3）。
    { provide: StorageService, useClass: LocalFsStorageService },
  ],
  exports: [FilesService],
})
export class FilesModule {}
