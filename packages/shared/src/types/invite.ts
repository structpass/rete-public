/**
 * 招待管理（Settings ST-5）の共有型（SSOT）。
 *
 * セキュリティ前提:
 *  - tokenHash は Response DTO に絶対出さない（repository の select で除外 + mapper で担保）。
 *  - effective status: PENDING + expiresAt 超過 → 'EXPIRED' を mapper で算出。
 *  - 受諾エンドポイントは公開（未ログイン）だが throttle 付き（brute-force 抑制）。
 */

/** 招待 effective status の許可集合（frontend がフィルタ等で iterate する SSOT・ANNOUNCEMENT_KINDS と同方針・set-0143）。 */
export const INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED'] as const;

/** 招待の effective status（表示用・INVITE_STATUSES の要素型）。DB 保存値 + expiresAt から mapper が算出。 */
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** 招待 1 件の Response 形（ADMIN 向け一覧 / 再送 / 削除 / 発行 の返却値）。 */
export interface InviteDto {
  id: string;
  email: string;
  /** Effective status（PENDING + 期限超過 → EXPIRED を mapper で算出）。 */
  status: InviteStatus;
  /** 発行日時（ISO 文字列・createdAt の別名）。 */
  invitedAt: string;
  /** 有効期限（ISO 文字列）。 */
  expiresAt: string;
  /** 受諾日時（ISO 文字列）。未受諾は null。 */
  acceptedAt: string | null;
  /** 発行者の表示名（invitedBy.name）。 */
  invitedByName: string;
}

/** CSV 一括インポートの結果サマリ。 */
export interface InviteImportResultDto {
  /** 招待を正常に発行できた件数。 */
  issued: number;
  /** スキップした件数（合計）。 */
  skipped: number;
  /** スキップ詳細（email → 理由）。 */
  skippedDetails: InviteSkipDetail[];
}

/** CSV インポートでスキップされた 1 行の詳細。 */
export interface InviteSkipDetail {
  email: string;
  reason: InviteSkipReason;
  /** CSV の行番号（1-based: ヘッダ=1、最初のデータ行=2）。論点4: エラー行特定用。 */
  row: number;
}

/**
 * CSV インポートのスキップ理由（DB 非保存の app-level 列挙のため snake_case・set-0143）。
 * - invalid_email: メールアドレス形式不正
 * - duplicate_pending: 同メールの有効な PENDING 招待が既に存在
 * - account_exists: 同メールの Account が既に存在
 * - mail_failed: メール送信失敗（best-effort・他行は継続）
 */
export type InviteSkipReason =
  | 'invalid_email'
  | 'duplicate_pending'
  | 'account_exists'
  | 'mail_failed';

/** 招待発行の入力（POST /invites）。 */
export interface CreateInviteInput {
  email: string;
  /** 受諾時に追加する GROUP Space ID（UUID）。論点1。 */
  spaceId: string;
}

/** 招待受諾の入力（POST /invites/accept・公開エンドポイント）。 */
export interface AcceptInviteInput {
  token: string;
  name: string;
  password: string;
}

/** メール設定状態（GET /invites/mail-status・論点2: SMTP 未設定の事前提示）。 */
export interface MailStatusDto {
  /** SMTP が設定済みで招待メールを送信可能か。 */
  configured: boolean;
  /** set-0126: SMTP_HOST が localhost 系（Mailpit などローカル catch-all）を指しているか。
   *  true の場合、開発環境で実受信箱にメールが届かない（Mailpit で捕捉される）旨の案内バナーを表示する。 */
  catchAll: boolean;
}
