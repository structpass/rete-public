import 'express-session';

/**
 * express-session の SessionData 拡張（認証境界の補助状態）。
 *
 * - authMethod: ログイン経路の印（R9）。'local'=パスワードログイン / 'sso'=外部 IdP 認証。
 *   OIDC interaction は Rete が認証情報を検証するため、ローカルpassword経路としてMFAを適用する。
 * - pendingMfa*: パスワード検証は通ったが TOTP 未確認の中間状態（R7・2 段階ログイン）。
 *   full passport login は行わず、accountとOIDC uidを退避し、通常またはOIDCのMFA endpointを待つ。
 *   route内上限に加え、失敗はAccount単位のDB lockoutにも加算する。
 */
declare module 'express-session' {
  interface SessionData {
    authMethod?: 'local' | 'sso';
    pendingMfaAccountId?: string;
    pendingMfaAttempts?: number;
    pendingMfaInteractionUid?: string;
    /** MFAを通過したローカル認証sessionの証跡。 */
    mfaVerifiedAt?: number;
  }
}
