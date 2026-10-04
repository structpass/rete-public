import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectOidcProvider, InteractionHelper, OidcInteraction } from 'nest-oidc-provider';
import type { Provider } from 'oidc-provider';
import type { Request } from 'express';
import { ok } from '../../../common/dto/response.dto';
import { AuthService, type AuthenticatedUser } from '../auth.service';
import { AuthenticatedGuard } from '../guards/authenticated.guard';
import { LoginDto } from '../dto/login.dto';
import { MfaCodeDto } from '../../mfa/dto/mfa-code.dto';
import { MfaService } from '../../mfa/mfa.service';
import { MFA_LOGIN_MAX_ATTEMPTS } from '../../mfa/mfa.constants';
import { LoginSettingsService } from '../../login-settings/login-settings.service';

type GrantInstance = InstanceType<Provider['Grant']>;

/**
 * OIDC interaction（RP authorize 中のログイン/同意）を完了するエンドポイント群。
 *
 * provider は未ログイン時にブラウザを frontend の `/login?uid=` へ飛ばす（oidc-config.factory の interactions.url）。
 * frontend はその画面から下記 endpoint を credentials 付き fetch で叩き、戻り値 `redirectTo` へ遷移して
 * authorize を再開する。interaction 状態は `_interaction` cookie で provider が解決するため :uid は経路表示用。
 *
 * 注: RP（struct-pass-reference）連携の full フロー検証は次フェーズ。本フェーズでは IdP として
 * 機能的に完結させる（login + consent 完了処理）ところまで実装する。
 */
@ApiTags('oidc-interaction')
@Controller('auth/interaction')
export class InteractionController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly loginSettings: LoginSettingsService,
    @InjectOidcProvider() private readonly provider: Provider,
  ) {}

  @ApiOperation({ summary: 'interaction の現在状態（prompt 種別 / client / scope）を取得' })
  @Get(':uid')
  async details(@OidcInteraction() interaction: InteractionHelper) {
    const details = await interaction.details();
    return ok({
      uid: details.uid,
      prompt: details.prompt.name,
      clientId: details.params.client_id as string | undefined,
      scope: details.params.scope as string | undefined,
    });
  }

  @ApiOperation({ summary: 'login prompt を完了（資格情報を検証し authorize を再開）' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':uid/login')
  async login(
    @OidcInteraction() interaction: InteractionHelper,
    @Body() dto: LoginDto,
    @Req() req: Request,
  ) {
    const details = await interaction.details();
    // 現在の prompt が login でない（consent 段階等）のに login を叩かれた場合は弾く。
    // 誤った prompt で result を確定させると authorize フローの整合性が崩れるため。
    if (details.prompt.name !== 'login') {
      throw new BadRequestException('現在のステップはログインではありません');
    }
    const user = await this.authService.validateCredentials(dto.email, dto.password);
    const mfaEnforced = await this.loginSettings.isMfaEnforced();
    const mfaEnabled = await this.mfaService.verifyHasEnabledMfa(user.id);
    const mfaConfirmed = await this.mfaService.hasConfirmedMfa(user.id);
    if (mfaEnforced && !mfaEnabled) {
      if (!mfaConfirmed) {
        throw new HttpException(
          {
            code: 'MFA_SETUP_REQUIRED',
            message: 'ReteにログインしてMFAを設定してから再試行してください',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      // An enabled setting that cannot be verified (for example, a missing encryption key) must fail closed.
      throw new ServiceUnavailableException('MFAを利用できません。管理者にお問い合わせください');
    }
    if (mfaEnabled) {
      req.session.pendingMfaAccountId = user.id;
      req.session.pendingMfaAttempts = 0;
      req.session.pendingMfaInteractionUid = details.uid;
      return ok({ mfaRequired: true });
    }

    await this.authService.resetLoginAttempts(user.id);
    delete req.session.pendingMfaAccountId;
    delete req.session.pendingMfaAttempts;
    delete req.session.pendingMfaInteractionUid;
    const redirectTo = await interaction.result(
      { login: { accountId: user.id, remember: false } },
      { mergeWithLastSubmission: false },
    );
    return ok({ redirectTo });
  }

  @ApiOperation({ summary: 'interaction の MFA チャレンジを検証して login prompt を完了' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':uid/login/mfa')
  async loginMfa(
    @OidcInteraction() interaction: InteractionHelper,
    @Body() dto: MfaCodeDto,
    @Req() req: Request,
  ) {
    const details = await interaction.details();
    if (details.prompt.name !== 'login') {
      throw new BadRequestException('現在のステップはログインではありません');
    }
    const accountId = req.session.pendingMfaAccountId;
    if (!accountId || req.session.pendingMfaInteractionUid !== details.uid) {
      throw new HttpException(
        {
          code: 'MFA_REQUIRED',
          message: '先にこの画面でメールアドレスとパスワードを確認してください',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.authService.assertMfaChallengeAllowed(accountId);
    const verified = await this.mfaService.verifyLoginChallenge(accountId, dto.code);
    if (!verified) {
      const accountLocked = await this.authService.registerFailedMfaAttempt(accountId);
      const attempts = (req.session.pendingMfaAttempts ?? 0) + 1;
      if (accountLocked || attempts >= MFA_LOGIN_MAX_ATTEMPTS) {
        delete req.session.pendingMfaAccountId;
        delete req.session.pendingMfaAttempts;
        delete req.session.pendingMfaInteractionUid;
      } else {
        req.session.pendingMfaAttempts = attempts;
      }
      throw new HttpException(
        { code: 'MFA_INVALID_CODE', message: '認証コードが正しくありません' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.authService.findActiveUser(accountId);
    if (!user) {
      delete req.session.pendingMfaAccountId;
      delete req.session.pendingMfaAttempts;
      delete req.session.pendingMfaInteractionUid;
      throw new HttpException(
        { code: 'MFA_REQUIRED', message: 'アカウントが無効です' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.authService.resetLoginAttempts(accountId);
    const redirectTo = await interaction.result(
      { login: { accountId: user.id, remember: false } },
      { mergeWithLastSubmission: false },
    );
    delete req.session.pendingMfaAccountId;
    delete req.session.pendingMfaAttempts;
    delete req.session.pendingMfaInteractionUid;
    return ok({ redirectTo });
  }

  @ApiOperation({
    summary: 'login prompt を既存 Rete セッションで完了（シームレス SSO・パスワード不要）',
  })
  // 資格情報は使わないが interaction を確定させる高リスク経路。password 経路と同じく 5 req/60s に絞る
  // （session を持つ攻撃者による interaction 列挙・多重確定の amplification を防ぐ）。
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthenticatedGuard)
  @Post(':uid/session-login')
  async sessionLogin(@OidcInteraction() interaction: InteractionHelper, @Req() req: Request) {
    const details = await interaction.details();
    // login 以外の prompt（consent 等）で叩かれた場合は弾く（password 経路と同じガード）。
    if (details.prompt.name !== 'login') {
      throw new BadRequestException('現在のステップはログインではありません');
    }
    const user = req.user as AuthenticatedUser;
    const mfaEnforced = await this.loginSettings.isMfaEnforced();
    const mfaEnabled = await this.mfaService.verifyHasEnabledMfa(user.id);
    const mfaConfirmed = await this.mfaService.hasConfirmedMfa(user.id);
    if (mfaEnforced && !mfaEnabled) {
      if (!mfaConfirmed) {
        throw new HttpException(
          {
            code: 'MFA_SETUP_REQUIRED',
            message: 'ReteにログインしてMFAを設定してから再試行してください',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      throw new ServiceUnavailableException('MFAを利用できません。管理者にお問い合わせください');
    }
    if (mfaEnabled && !req.session.mfaVerifiedAt) {
      throw new HttpException(
        { code: 'MFA_REQUIRED', message: 'Reteにログインし直してMFAを確認してください' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    // R9: SSO（既存 Rete セッションでの interaction 完了）も 'sso' で印付けする。
    req.session.authMethod = 'sso';
    const redirectTo = await interaction.result(
      { login: { accountId: user.id, remember: false } },
      { mergeWithLastSubmission: false },
    );
    return ok({ redirectTo });
  }

  @ApiOperation({ summary: 'consent prompt を完了（要求 scope/claim の grant を作成）' })
  // login / session-login と同値の per-route Throttle。ここだけ素通しだと interaction cookie 保持者が
  // confirm を連投して Grant 行を積み上げられる（グローバル 30/min が唯一の歯止めになる）。
  // 認証済み経路だが書き込みを増幅できる以上、他経路と同じく 5 req/60s に絞る（rev-quality 2026-07-31）。
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':uid/confirm')
  async confirm(@OidcInteraction() interaction: InteractionHelper) {
    const details = await interaction.details();
    const accountId = details.session?.accountId;
    if (!accountId) {
      // login 未完了で consent に到達した場合は安全側に倒し、login をやり直させる。
      const redirectTo = await interaction.result({ error: 'login_required' });
      return ok({ redirectTo });
    }

    const promptDetails = details.prompt.details as {
      missingOIDCScope?: string[];
      missingOIDCClaims?: string[];
      missingResourceScopes?: Record<string, string[]>;
    };

    let grant: GrantInstance | undefined;
    if (details.grantId) {
      grant = await this.provider.Grant.find(details.grantId);
    }
    if (!grant) {
      grant = new this.provider.Grant({
        accountId,
        clientId: details.params.client_id as string,
      });
    }

    if (promptDetails.missingOIDCScope) {
      grant.addOIDCScope(promptDetails.missingOIDCScope.join(' '));
    }
    if (promptDetails.missingOIDCClaims) {
      grant.addOIDCClaims(promptDetails.missingOIDCClaims);
    }
    if (promptDetails.missingResourceScopes) {
      for (const [indicator, scopes] of Object.entries(promptDetails.missingResourceScopes)) {
        grant.addResourceScope(indicator, scopes.join(' '));
      }
    }

    const grantId = await grant.save();
    const redirectTo = await interaction.result(
      { consent: { grantId } },
      { mergeWithLastSubmission: true },
    );
    return ok({ redirectTo });
  }
}
