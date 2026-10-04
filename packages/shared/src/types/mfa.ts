/**
 * MFA/TOTP（Settings ST-2-2）の共有型（SSOT）。認証アプリ（TOTP）方式（モック逸脱: method email→totp / ADR 0040）。
 *
 * backend の DTO / mapper と frontend の MFA 設定画面・MFA ログインチャレンジが本定義を import して使う（§5 shared 型整合）。
 *
 * セキュリティ境界（厳守）:
 * - 暗号化 secret / codeHash / 平文 secret は Response に絶対に載せない。
 * - otpauth URI（QR 用）と バックアップコード平文配列は setup / confirm / regenerate の専用レスポンスでのみ「一度だけ」返す。
 */

/** 自分の MFA 状態（GET /settings/mfa）。secret は一切含めない。 */
export interface MfaStatusDto {
  /** TOTP が有効化済みか（confirm 完了で true）。 */
  enabled: boolean;
  /** 初回 TOTP 検証に成功した時刻（ISO 文字列・未確認/未設定なら null）。 */
  confirmedAt: string | null;
}

/**
 * MFA セットアップ開始レスポンス（POST /settings/mfa/setup）。
 * QR 描画はフロント（qrcode.react）が otpauthUri から行う。secret 平文はここでも返さない（URI に埋め込まれる前提）。
 * この時点では enabled=false（confirm 未完了）。
 */
export interface MfaSetupDto {
  /** 認証アプリ登録用 otpauth:// URI（QR 化はフロント）。一度きりの発行。 */
  otpauthUri: string;
}

/** TOTP コード（6 桁）または バックアップコードを送る共通入力（confirm / disable）。 */
export interface MfaCodeInput {
  /** 認証アプリの 6 桁コード、または発行済みバックアップコード。 */
  code: string;
}

/**
 * バックアップコード発行レスポンス（POST /settings/mfa/confirm の成功時 / POST /settings/mfa/backup-codes/regenerate）。
 * 平文配列はこのレスポンスでのみ「一度だけ」返す（DB には argon2 ハッシュのみ保持・再表示不可）。
 */
export interface MfaBackupCodesDto {
  /** single-use バックアップコード平文の配列（10 個）。一度だけ表示。 */
  backupCodes: string[];
}
