import type { Attachment } from './api';
import { isPendingAttachment } from './attachment-status';

/** 同名添付を弾いた時のトースト文言（dsk-0273）。 */
export const DUPLICATE_ATTACHMENT_NAME_MESSAGE = '同名のファイルは既に添付されています';

/**
 * 選択したファイル名と同名の「確定済み」添付を探す（dsk-0273 の共通チェック）。
 * サーバ側の二重添付防止（@@unique = 同一対象 × 同一 fileVersionId）は「同名だが別のファイル実体」を
 * 検知できないため、ピッカーでの選択直後にファイル名一致で弾く。保留チップ（useDeferredAttachments の
 * 未確定分）は比較対象に含めない（確定済み一覧との重複チェックに限定・dsk-0273 スコープ）。
 * チャット詳細メッセージ添付／タスク詳細本体添付の両経路がこの 1 箇所を呼ぶ。タスクコメント編集への
 * 添付追加（dsk-0279 新設予定）も本関数を呼び出して同じ制約を得る（申し送り）。
 * 「同名」は厳密一致（大文字小文字・空白を区別）: Files 側がファイル名を厳密一致で別実体として扱う
 * ため、その同一性の定義に揃える（大文字小文字非区別にすると Files 上は別ファイルの添付を誤って弾く）。
 */
export function findDuplicateAttachmentName(
  attachments: Attachment[],
  fileName: string,
): Attachment | undefined {
  return attachments.find((att) => !isPendingAttachment(att) && att.fileName === fileName);
}
