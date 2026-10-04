import { Module } from '@nestjs/common';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { InviteRepository } from './repositories/invite.repository';
import { MailModule } from '../../common/mail/mail.module';

/**
 * 招待管理（Settings ST-5）。
 * - 管理系: ADMIN による発行・一覧・再送・削除・CSV インポート。
 * - 公開: 受諾エンドポイント（throttle 付き・guard 無し）。
 * - メール送信は MailModule 経由（SMTP 未設定なら graceful degradation で 503）。
 */
@Module({
  imports: [MailModule],
  controllers: [InviteController],
  providers: [InviteService, InviteRepository],
})
export class InviteModule {}
