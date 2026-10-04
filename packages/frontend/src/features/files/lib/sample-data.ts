/**
 * File タブの共有オーバーレイ用サンプル定義（上限）。
 *
 * フォルダツリー/一覧の実データは backend（GET /files/tree・/folders/:id）へ移行済のため、
 * かつての SAMPLE_FOLDERS / SAMPLE_LOCATIONS は撤去した。送信先チャネル候補（SAMPLE_CHAT_DESTINATIONS /
 * SAMPLE_TASK_DESTINATIONS）は未参照のため knip 検出（set-0049）で削除済み。
 */

/** 1 回の共有で挿入できるパス付きリンクの上限（spec §6.3）。 */
export const MAX_LINKS = 10;
