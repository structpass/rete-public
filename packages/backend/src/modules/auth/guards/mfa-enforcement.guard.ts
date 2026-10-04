import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { LoginSettingsService } from '../../login-settings/login-settings.service';
import { MfaService } from '../../mfa/mfa.service';
import { AuthenticatedUser } from '../auth.service';
import { API_GLOBAL_PREFIX_PATH } from '../../../common/config/api-routes';

/**
 * 全体強制 MFA の遮断ガード（R8）。login-settings.mfaEnforced=true かつ session.authMethod==='local' かつ
 * 当該 account が confirmed な MfaSetting を持たない場合、保護ルートを 403 MFA_SETUP_REQUIRED で遮断する。
 *
 * 適用は 'local' 認証経路のみ（SSO 経由は IdP MFA を尊重・R9）。本ガードはグローバル登録し、例外（通す）を
 * EXEMPT_PATHS で持つ: MFA セットアップ系・GET /auth/me・POST /auth/logout（設定画面へ到達させるため）。
 * 未認証リクエストは AuthenticatedGuard / 各所の認証境界に委ね、本ガードは認証済のみ判定する（req.user 不在は素通し）。
 */
@Injectable()
export class MfaEnforcementGuard implements CanActivate {
  /** グローバル prefix（main.ts setGlobalPrefix）。req.path には prefix 込みで載るため照合前に剥がす。 */
  private static readonly GLOBAL_PREFIX = API_GLOBAL_PREFIX_PATH;

  /**
   * 強制から除外する path（prefix 剥がし後の厳密な前方一致）。部分文字列一致（includes）は使わない
   * （`/foo/settings/mfa-export` 等が誤って除外される穴を作らないため・完全な base または `base/...` のみ許可）。
   * - /settings/mfa 配下 = MFA 設定を完了させるための導線
   * - /auth/me（状態取得）/ /auth/logout（離脱）/ /auth/login（+ /auth/login/mfa の 2 段階）
   * - /settings/login 配下 = MFA 制御盤自体（password-policy・ip-whitelist）。同配下は
   *   LoginSettingsController の @Roles(ADMIN) で ADMIN 限定に守られているため、ADMIN が元から持っていた
   *   権限（MFA 強制 OFF 時にこれらのエンドポイントへ完全アクセスできた状態）を超える新規の露出は生まれない。
   *   強制 ON 時に ADMIN が password-policy の PUT を通じて mfaEnforced を false へ戻す経路も通す。
   *   ※ mfaEnforced は password-policy DTO 内のフィールド（専用 endpoint は無い）で、同 PUT 内で
   *   まとめて更新する設計。本コメントだけを読んで「PUT /settings/login/mfa-enforced」の存在を
   *   想定しないこと（route 探索が空振りする）。
   *   この除外が無いと「ON にはできたのに OFF に戻せない one-way ロックアウト」になる
   *   （fil-0080 撮影中に 開発エージェントが発見・set-0134）。
   */
  private static readonly EXEMPT_BASES = [
    '/settings/mfa',
    '/settings/login',
    '/auth/me',
    '/auth/logout',
    '/auth/login',
  ];

  constructor(
    private readonly loginSettings: LoginSettingsService,
    private readonly mfaService: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 未認証は本ガードの対象外（認証境界は AuthenticatedGuard 等に委譲）。
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) return true;

    // SSO 経由は IdP MFA を尊重し強制しない（R9）。authMethod 未設定（古いセッション等）は
    // 'local' 相当として強制対象に含める（fail-open 防止・明示的に 'local' 以外のみ除外）。
    const authMethod = req.session?.authMethod ?? 'local';
    if (authMethod !== 'local') return true;

    // 除外 path（セットアップ導線 / me / logout / login）は常に通す。
    // グローバル prefix を剥がし、`base` 完全一致 or `base/...` のみ除外（部分文字列一致はしない）。
    const raw = (req.path || req.url || '').split('?')[0];
    const path = raw.startsWith(MfaEnforcementGuard.GLOBAL_PREFIX)
      ? raw.slice(MfaEnforcementGuard.GLOBAL_PREFIX.length)
      : raw;
    if (MfaEnforcementGuard.EXEMPT_BASES.some((b) => path === b || path.startsWith(`${b}/`))) {
      return true;
    }

    // 全体強制 OFF なら素通し。
    if (!(await this.loginSettings.isMfaEnforced())) return true;

    // confirmed MFA を持っていれば通す。未設定なら設定フローへ誘導するため 403 で遮断する。
    if (await this.mfaService.hasConfirmedMfa(user.id)) return true;

    throw new HttpException(
      { code: 'MFA_SETUP_REQUIRED', message: 'MFA の設定が必要です' },
      HttpStatus.FORBIDDEN,
    );
  }
}
