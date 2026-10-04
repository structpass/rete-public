import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MfaService } from './mfa.service';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * MFA/TOTP（Settings ST-2-2）の REST。全エンドポイントはログイン必須かつ本人のみを対象にする
 * （@CurrentUser('id') で account を取得。クライアントが渡す任意の id は信用しない = IDOR 防止）。
 *
 * セキュリティ境界（厳守）: secret 平文 / 暗号化値 / codeHash はレスポンスに載せない。
 * otpauth URI（setup）と バックアップコード平文（confirm/regenerate）は専用レスポンスで一度だけ返す。
 * コード検証を伴う高リスク経路（confirm/disable/regenerate）は throttle を絞る（総当たり抑制）。
 */
@ApiTags('mfa')
@Controller('settings/mfa')
@UseGuards(AuthenticatedGuard)
export class MfaController {
  constructor(private readonly service: MfaService) {}

  @Get()
  @ApiOperation({ summary: '自分の MFA 状態（enabled / confirmedAt・secret は返さない）' })
  getStatus(@CurrentUser('id') accountId: string) {
    return this.service.getStatus(accountId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'MFA セットアップ開始（secret 生成 → otpauth URI を一度だけ返す）' })
  setup(@CurrentUser('id') accountId: string, @CurrentUser('email') email: string) {
    return this.service.setup(accountId, email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '初回 TOTP 検証で有効化 → バックアップコード平文を一度だけ返す' })
  confirm(@CurrentUser('id') accountId: string, @Body() dto: MfaCodeDto) {
    return this.service.confirm(accountId, dto.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'コード（TOTP or バックアップ）で本人確認して MFA を無効化' })
  disable(@CurrentUser('id') accountId: string, @Body() dto: MfaCodeDto) {
    return this.service.disable(accountId, dto.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '本人確認してバックアップコードを再発行（旧コードは全失効）' })
  regenerateBackupCodes(@CurrentUser('id') accountId: string, @Body() dto: MfaCodeDto) {
    return this.service.regenerateBackupCodes(accountId, dto.code);
  }
}
