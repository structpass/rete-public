import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentsRepository } from './repositories/attachments.repository';
import { MembershipsModule } from '../memberships/memberships.module';

/**
 * Desk 添付モジュール（FL-3）。タスク/チャット発話 ↔ ファイル版の中間テーブルを介した添付。
 * PrismaService は Global な DatabaseModule から注入される（FilesModule と同方針で個別 import 不要）。
 * MembershipsModule を import して ScopeVisibilityService を注入し、存在秘匿の可視性チェック（ADR 0038）と
 * 添付元ファイルの器の可視性検証（cmn-0279）を行う。ADR 0063 で File 側の ACL 解決器が無くなったため、
 * FolderAclService 注入目的で入れていた FilesModule の import は不要になった。
 */
@Module({
  imports: [MembershipsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsRepository],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
