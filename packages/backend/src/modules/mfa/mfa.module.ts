import { Module } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { MfaRepository } from './repositories/mfa.repository';

/**
 * MFA/TOTP（Settings ST-2-2）。認証アプリ（TOTP）方式・本人のみ・暗号化 secret 保管 + バックアップコード。
 * MfaService は AuthModule（ログインチャレンジ R7 / MfaEnforcementGuard R8）からも使うため export する。
 */
@Module({
  controllers: [MfaController],
  providers: [MfaService, MfaRepository],
  exports: [MfaService],
})
export class MfaModule {}
