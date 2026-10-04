/**
 * チャット（Desk）の応答文言（v2-238）。
 *
 * files.constants.ts と同じ分担: repository は reason だけを返し、利用者へ見せる文言は service が
 * 本ファイルの定数へ翻訳する。以前は chat.service.ts が `Chat theme with id ${id} not found` の
 * ように英語＋内部 ID を直接組み立てており、ファイル側（定数集約）と非対称だった。文言は Desk の
 * 操作トースト（features/desk/lib/api-error.ts が backend の error.message をそのまま surface する）
 * にそのまま出るため、日本語かつ内部 ID を含まない形へ揃える。
 *
 * 不在の対象（テーマ / メッセージ）で文言を分けるのは、利用者が「何が無いのか」を読み取れるようにする
 * ため。対象を潰して 1 文言にすると、API の応答から失敗した対象が分からなくなる。
 *
 * 同じ 404 は「対象が無い」だけでなく「対象は在るが自分からは見えない」場合にも返る（存在秘匿・ADR 0038）。
 * 非可視側だけ別文言（共有ガードの Resource not found）だと、応答本文がそのまま「存在するか」の oracle に
 * なるため、chat.service.ts は可視性ガードの 404 も本定数へ写し替える（v2-246）。**不在と非可視は同じ
 * 文言で返す**という不変条件を崩さないこと。
 */
export const CHAT_THEME_NOT_FOUND_MESSAGE = 'チャットテーマが見つかりません';

/**
 * メッセージ単体（リアクション・編集・削除の対象）が存在しない時の文言。親テーマが非可視の場合も
 * 同じ文言で返る（CHAT_THEME_NOT_FOUND_MESSAGE と同じ理由・v2-246）。
 */
export const CHAT_MESSAGE_NOT_FOUND_MESSAGE = 'チャットメッセージが見つかりません';
