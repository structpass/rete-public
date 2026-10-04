import { Module } from '@nestjs/common';
import { LoginSettingsController } from './login-settings.controller';
import { LoginSettingsService } from './login-settings.service';
import { LoginSettingsRepository } from './repositories/login-settings.repository';

/**
 * ログイン設定（Settings ST-2）。パスワードポリシー（ST-2-1）+ IP 許可リスト（ST-2-3）。ADMIN 限定。
 * MFA（ST-2-2）は operational-policy §7 fill 後に追加。enforcement は hardening 連携で別途。
 */
@Module({
  controllers: [LoginSettingsController],
  providers: [LoginSettingsService, LoginSettingsRepository],
  // AuthModule（ログイン時の MFA 全体強制判定 R8 / MfaEnforcementGuard）が isMfaEnforced を使うため export。
  exports: [LoginSettingsService],
})
export class LoginSettingsModule {}
