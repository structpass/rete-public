import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** メール送信抽象を提供する共通 infra モジュール（ADR 0035）。必要なモジュール（招待等）が import して MailService を注入する。 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
