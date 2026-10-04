import type { Attachment } from './api';

/** 保留追加チップの合成 id 接頭辞（確定添付の UUID と衝突しない）。 */
export const PENDING_ID_PREFIX = 'pending-';

/** 保留追加チップの合成 Attachment を pending と判別する（AttachmentChipsRow のツールチップ出し分け用）。 */
export function isPendingAttachment(att: Attachment): boolean {
  return att.versionNo === 0 && att.id.startsWith(PENDING_ID_PREFIX);
}
