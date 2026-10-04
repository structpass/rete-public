/**
 * ログイン設定（Settings ST-2）の共有型（SSOT）。
 *
 * 対象設定:
 * - パスワードポリシー（ST-2-1）: 必須文字種 + 最小桁数。強度検証 helper（backend common/security）に供給。
 *   全体強制 MFA トグル（ST-2-2b・mfaEnforced）も同 singleton に同居する（下記 PasswordPolicyDto 参照）。
 * - IP アドレス許可リスト（ST-2-3）: CIDR エントリ列。空 = 制限なし。
 *
 * 個人 MFA 登録（ST-2-2a・TOTP secret / バックアップコード）は別型 [mfa.ts] に分離（本ファイルには含めない）。
 * IP 遮断 middleware（enforcement）は本トラックの責務外。設定の保存・取得まで。
 *
 * backend の DTO / mapper と frontend のログイン設定画面が本定義を import して使う（§5 shared 型整合）。
 */

/** パスワードポリシー設定値（単一テナント singleton）。GET / PUT 双方でこの形を授受する（全置換）。 */
export interface PasswordPolicyDto {
  /** 小文字英字 a-z を必須とする。 */
  requireLowercase: boolean;
  /** 大文字英字 A-Z を必須とする。 */
  requireUppercase: boolean;
  /** 数字 0-9 を必須とする。 */
  requireNumber: boolean;
  /** 記号（英数字以外）を必須とする。 */
  requireSymbol: boolean;
  /** 最小桁数（4-64）。 */
  minLength: number;
  /**
   * 全体強制 MFA（ST-2-2・全体強制トグル）。ON で local 認証の全メンバーが TOTP 設定完了まで保護ルートを遮断される。
   * SSO 経由ログインには適用しない（IdP 側 MFA を尊重）。GET/PUT 双方でこの値を授受する（全置換）。
   */
  mfaEnforced: boolean;
}

/** パスワードポリシー更新入力（PUT・全置換）。Response と同形。 */
export type PasswordPolicyInput = PasswordPolicyDto;

/**
 * 最小桁数の許容範囲（SSOT）。frontend の保存時クランプと backend のバリデーション境界（@Min/@Max）を
 * 同一値に固定するため shared で一元管理する。モック settings/login-settings の input min/max に一致。
 */
export const PASSWORD_MIN_LENGTH_FLOOR = 4;
export const PASSWORD_MIN_LENGTH_CEIL = 64;

/** IP 許可リストの 1 エントリ（Response）。 */
export interface IpWhitelistEntryDto {
  id: string;
  /** 許可 CIDR（IPv4 / IPv6）。 */
  cidr: string;
  /** 備考（空可）。 */
  note: string;
}

/** IP 許可リスト設定値（Response）。 */
export interface IpWhitelistDto {
  /** 許可エントリ（sortOrder 昇順・空 = 制限なし）。 */
  entries: IpWhitelistEntryDto[];
  /** リクエスト由来の検出 IP（保存対象外・自己ロックアウト警告の表示用）。 */
  currentIp: string;
}

/** IP 許可リストの 1 エントリ入力（PUT・全置換）。 */
export interface IpWhitelistEntryInput {
  cidr: string;
  /** 備考（任意・省略時は空文字で保存）。 */
  note?: string;
}

/** IP 許可リスト更新入力（PUT・全置換）。空配列 = 制限解除。 */
export interface IpWhitelistInput {
  entries: IpWhitelistEntryInput[];
}
