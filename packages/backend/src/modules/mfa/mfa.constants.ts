/** MFA/TOTP（Settings ST-2-2）の定数（SSOT）。 */

/** otpauth URI の issuer（認証アプリ上の表示名）。 */
export const MFA_TOTP_ISSUER = 'Rete';

/** 発行するバックアップコードの個数。 */
export const MFA_BACKUP_CODE_COUNT = 10;

/**
 * バックアップコード 1 個の長さ（英数字）。視認性のため紛らわしい文字（0/O/1/I/l 等）は除いた alphabet を使う。
 */
export const MFA_BACKUP_CODE_LENGTH = 10;

/** バックアップコードに使う文字集合（紛らわしい文字を除外）。 */
export const MFA_BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** TOTP コードの桁数（otplib 既定）。confirm/login の入力検証に使う。 */
export const MFA_TOTP_DIGITS = 6;

/**
 * TOTP 検証の許容ずれ（秒）。時計ずれ吸収のため ±30s（= ±1 step・標準 30s 周期）を許容する。
 * otplib v13 functional verify の epochTolerance（秒・対称）に渡す。
 */
export const MFA_TOTP_EPOCH_TOLERANCE_SEC = 30;

/**
 * TOTP の time-step 周期（秒）。replay 対策（cmn-0094）で usedCounter を算出する時に使う:
 * `usedCounter = Math.floor(Date.now() / 1000 / MFA_TOTP_PERIOD_SEC) + otplibVerifyDelta`。
 * otplib / RFC 6238 既定の 30 秒周期（= epochTolerance 1 step 分）。
 */
export const MFA_TOTP_PERIOD_SEC = 30;

/** MFA ログインチャレンジ（pending session）での TOTP/バックアップコード試行上限。超過で pending を破棄する（H6 補完）。 */
export const MFA_LOGIN_MAX_ATTEMPTS = 5;
