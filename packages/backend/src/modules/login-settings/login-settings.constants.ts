import type { PasswordPolicyDto } from '@rete/shared';

/** パスワードポリシーは単一テナント singleton（ADR 0017）。固定 id の 1 行で運用する。 */
export const PASSWORD_POLICY_SINGLETON_ID = 'password-policy-singleton';

// 最小桁数の許容下限・上限は shared を SSOT とし（frontend のクランプと境界を統一）、ここでは re-export する。
export { PASSWORD_MIN_LENGTH_FLOOR, PASSWORD_MIN_LENGTH_CEIL } from '@rete/shared';

/** IP 許可リストの 1 エントリ CIDR 文字列の最大長（IPv6 最長 "ffff:…:ffff/128" ≈ 43 字 + 余裕）。 */
export const IP_CIDR_MAX_LENGTH = 50;

/**
 * 新テナント初期パスワードポリシー（未設定時 / 行不在時に返す）。
 * shared の DEFAULT_PASSWORD_POLICY（全 false のフォールバック形）とは型・意味論が異なる別概念
 * （こちらは新規テナントへ配布する初期値）のため、同名にせず別名で持つ（cmn-0084）。
 */
export const DEFAULT_TENANT_PASSWORD_POLICY: PasswordPolicyDto = {
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: false,
  minLength: 8,
  mfaEnforced: false,
};

/** IP 許可リストの 1 エントリ備考の最大長。 */
export const IP_NOTE_MAX_LENGTH = 200;

/** IP 許可リストの最大エントリ数（全置換 createMany の暴発防止）。 */
export const IP_WHITELIST_MAX_ENTRIES = 500;
