import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth.service';
import { API_GLOBAL_PREFIX_PATH } from '../../../common/config/api-routes';

/**
 * 強制パスワード変更の遮断ガード（set-0035）。session の本人 account が mustChangePassword=true の間、
 * 保護ルートを 403 PASSWORD_CHANGE_REQUIRED で遮断する。MfaEnforcementGuard と同型の「ログイン後ゲート」で、
 * フロントの横断ゲート（AppShell）が UX 層、本ガードが真の保護境界（API 直叩きも遮断）。
 *
 * 判定は req.user（毎リクエスト deserialize で DB から再構築）の mustChangePassword を読むだけ＝追加クエリなし。
 * 適用は 'local' 認証経路のみ（SSO は IdP 認証でローカルパスワードを持たず、変更画面に誘導すると詰むため除外・R9 同旨）。
 * 例外（通す）を EXEMPT_BASES で持つ: 変更 API 本体 / パスワードポリシー取得（変更画面の inline 検証用）/ me / logout / login。
 * 未認証は AuthenticatedGuard 等に委ね、本ガードは認証済みのみ判定する（req.user 不在は素通し）。
 */
@Injectable()
export class PasswordChangeEnforcementGuard implements CanActivate {
  /** グローバル prefix（main.ts setGlobalPrefix）。req.path には prefix 込みで載るため照合前に剥がす。 */
  private static readonly GLOBAL_PREFIX = API_GLOBAL_PREFIX_PATH;

  /**
   * 強制から除外する path（prefix 剥がし後・完全一致 or `base/...` のみ。部分文字列一致はしない）。
   * - /auth/change-password = 変更を完了させる本線 API
   * - /settings/login/password-policy = 変更画面の inline ポリシー検証に必要（GET。PUT は別途 ADMIN ガードで保護）
   * - /auth/me（状態取得）/ /auth/logout（離脱）/ /auth/login（再ログイン経路）
   * - /auth/interaction = OIDC フェデレーションの handshake（:uid / :uid/login / :uid/session-login / :uid/confirm）。
   *   本ガードは authMethod を session から読むが、session-login は authMethod='sso' への書き換えを
   *   ハンドラ内で行うため到達時点では 'local' のまま＝除外しないと SSO 開始が 403 で破断する。
   *   federation は既認証セッションの ID 連携であり一時パスワードを下流に渡さない。Rete 本体は AppShell
   *   ゲート＋業務 API ガードで引き続き変更を強制するため、ここを通しても強制は迂回されない
   *   （MfaEnforcementGuard が実効的に interaction を阻害しないのと同旨）。
   */
  private static readonly EXEMPT_BASES = [
    '/auth/change-password',
    '/settings/login/password-policy',
    '/auth/me',
    '/auth/logout',
    '/auth/login',
    '/auth/interaction',
  ];

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // 未認証は本ガードの対象外（認証境界は AuthenticatedGuard 等に委譲）。
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) return true;

    // 強制変更が立っていなければ素通し（大多数のケース）。
    if (!user.mustChangePassword) return true;

    // SSO 経由はローカルパスワードを持たないため強制しない。authMethod 未設定（古いセッション等）は
    // 'local' 相当として強制対象に含める（fail-open 防止・明示的に 'local' 以外のみ除外・MfaEnforcementGuard と同旨）。
    const authMethod = req.session?.authMethod ?? 'local';
    if (authMethod !== 'local') return true;

    // 除外 path（変更導線 / ポリシー取得 / me / logout / login）は常に通す。
    const raw = (req.path || req.url || '').split('?')[0];
    const path = raw.startsWith(PasswordChangeEnforcementGuard.GLOBAL_PREFIX)
      ? raw.slice(PasswordChangeEnforcementGuard.GLOBAL_PREFIX.length)
      : raw;
    if (
      PasswordChangeEnforcementGuard.EXEMPT_BASES.some(
        (b) => path === b || path.startsWith(`${b}/`),
      )
    ) {
      return true;
    }

    throw new HttpException(
      { code: 'PASSWORD_CHANGE_REQUIRED', message: 'パスワードの変更が必要です' },
      HttpStatus.FORBIDDEN,
    );
  }
}
