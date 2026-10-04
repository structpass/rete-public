import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { LoginSettingsService } from './login-settings.service';
import { UpdatePasswordPolicyDto } from './dto/update-password-policy.dto';
import { UpdateIpWhitelistDto } from './dto/update-ip-whitelist.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { clientIp } from '../../common/net/client-ip';

/**
 * ログイン設定（Settings ST-2）。パスワードポリシー / IP 許可リストはセキュリティ境界の設定変更のため
 * 全エンドポイントを ADMIN 限定にする（クラスレベル @Roles(Role.ADMIN) を RolesGuard が getAllAndOverride で適用）。
 * 認証のみのテナント設定（SettingsController）とは別モジュールに分け、ADMIN 境界を混在させない。
 * MFA（ST-2-2）は operational-policy §7 fill 後に本コントローラへ追加する。
 */
@ApiTags('login-settings')
@Controller('settings/login')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(Role.ADMIN)
export class LoginSettingsController {
  constructor(private readonly service: LoginSettingsService) {}

  @Get('password-policy')
  @ApiOperation({ summary: 'パスワードポリシー取得（ADMIN 限定）' })
  getPasswordPolicy() {
    return this.service.getPasswordPolicy();
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Put('password-policy')
  @ApiOperation({ summary: 'パスワードポリシー更新（全置換・ADMIN 限定）' })
  updatePasswordPolicy(@Body() dto: UpdatePasswordPolicyDto) {
    return this.service.updatePasswordPolicy(dto);
  }

  @Get('ip-whitelist')
  @ApiOperation({ summary: 'IP 許可リスト取得（検出 currentIp 同梱・ADMIN 限定）' })
  getIpWhitelist(@Req() req: Request) {
    return this.service.getIpWhitelist(clientIp(req));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Put('ip-whitelist')
  @ApiOperation({ summary: 'IP 許可リスト更新（全置換・CIDR 検証・ADMIN 限定）' })
  updateIpWhitelist(@Body() dto: UpdateIpWhitelistDto, @Req() req: Request) {
    return this.service.updateIpWhitelist(dto, clientIp(req));
  }
}
