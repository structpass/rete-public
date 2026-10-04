/**
 * multipart（multer / busboy）の上限・形式エラーと、回数制限の文言を利用者向けの日本語へ訳す（v2-191・v2-209 で共通層へ移設）。
 *
 * これらのエラーは英語の固定文言で投げられ、@nestjs/platform-express の transformException が
 * MulterError を HttpException へ変換する時点で code（LIMIT_FILE_COUNT 等）は失われ、message だけが残る
 * （platform-express 11.1.28 を実測）。そのため code では引けず、文言で訳す。
 *
 * 一致は「完全一致」か「` - ` で field 名が後置された形」に限る（Nest は `Unexpected field - note` のように
 * field 名を後置する）。前方一致にすると、業務エラーの文言がたまたま同じ語で始まった時に multipart の案内へ
 * 誤って差し替わる（利用者が付けたファイル名が文言の先頭に入りうるため、起こりうる）。
 *
 * 文言は multer 2.2.0 の errorMessages・busboy 1.6.0 の throw 文言・@nestjs/throttler 6.5.0 の
 * ThrottlerException に一致させ、実サーバーの回帰テストが応答本文で固定している。
 *
 * アップロード経路は複数モジュールにまたがる（file のアップロード2経路・招待の CSV 取り込み）ため、
 * 機能モジュールではなく共通層に置く。経路ごとの上限値は呼び出し側が渡す（v2-209）。
 */
import { formatFileSize } from '../text/file-size';

/**
 * 訳文の材料。maxFileSizeBytes は「その経路の multipart 層のファイルサイズ上限」で、表示用の実値。
 * 設定値ではない（招待 CSV の 1MB は固定で、可変パラメータにしない＝v2-196 の開発統括判断）。
 */
export interface UploadErrorMessageOptions {
  /** multipart 層（limits.fileSize）の上限バイト数。未指定なら上限値を含まない汎用文にする。 */
  maxFileSizeBytes?: number;
}

/** 'File too large' の訳文を、その経路の実値から組み立てる。 */
function fileTooLargeMessage(maxFileSizeBytes?: number): string {
  return maxFileSizeBytes === undefined
    ? 'ファイルサイズが上限を超えています'
    : `ファイルサイズが上限（${formatFileSize(maxFileSizeBytes)}）を超えています`;
}

/**
 * 英語の固定文言 → 日本語の案内文。'File too large' だけは上限値に依存するため関数で組み立てる
 * （module ロード時の定数にすると、経路ごとの実値を出せない）。
 */
const UPLOAD_ERROR_MESSAGES: ReadonlyArray<readonly [message: string, translated: string]> = [
  ['Too many files', '1 回にアップロードできるファイルは 1 件です'],
  // 区切りの数が上限を超えた場合。通常の 1 ファイル送信でも起きるため、原因を断定せず形式の問題として案内する。
  ['Too many parts', '送信されたデータの形式が不正です（区切りの数が上限を超えました）'],
  ['Too many fields', 'ファイルと一緒に項目は送信できません'],
  ['Field name too long', '送信された項目名が長すぎます'],
  ['Field name missing', '送信されたデータの形式が不正です（項目名がありません）'],
  ['Field name nesting too deep', '送信されたデータの形式が不正です（項目の入れ子が深すぎます）'],
  ['Field value too long', '送信された項目の値が長すぎます'],
  ['Unexpected field', '想定していない項目が送信されました'],
  ['Multipart: Boundary not found', '送信されたデータの形式が不正です（区切りが見つかりません）'],
  ['Multipart: Malformed part header', '送信されたデータの形式が不正です（区切りが壊れています）'],
  ['Multipart: Unexpected end of form', '送信が途中で切れました。もう一度お試しください'],
  ['Multipart: Unexpected end of file', '送信が途中で切れました。もう一度お試しください'],
  // 回数制限（既定 20 件/分・経路によっては 5 件/分）。フレームワーク名がそのまま出るため日本語へ訳す。
  [
    'ThrottlerException: Too Many Requests',
    'アップロードの回数が多すぎます。少し待ってからお試しください',
  ],
];

/** multipart 層のファイルサイズ超過。上限値を実値で案内するため、他の文言と分けて扱う。 */
const FILE_TOO_LARGE = 'File too large';

/** field 名の後置（Nest が付ける）を許す区切り。 */
const FIELD_SUFFIX = ' - ';

/** 表の英文に一致するか（完全一致、または ` - ` で field 名が後置された形）。 */
function matches(message: string, english: string): boolean {
  return message === english || message.startsWith(`${english}${FIELD_SUFFIX}`);
}

/** multipart 由来の英語文言なら日本語の案内文を、対象外なら undefined を返す。 */
export function translateUploadErrorMessage(
  message: string,
  options: UploadErrorMessageOptions = {},
): string | undefined {
  if (matches(message, FILE_TOO_LARGE)) return fileTooLargeMessage(options.maxFileSizeBytes);
  return UPLOAD_ERROR_MESSAGES.find(([english]) => matches(message, english))?.[1];
}
