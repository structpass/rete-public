import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/lib/error-utils';
import { createAttachment, type AttachmentTargetType } from './api';

/**
 * 保留ファイル群を確定済みエンティティへ best-effort 添付する（FL-3b 共有ヘルパ）。
 * 個々の失敗は toast で投影しつつ続行し、一部成功を許容する。deferred-flush（usePendingAttachments.flush）と
 * 返信投稿（use-chat-thread.postMessage の post→attach→reload）の双方が本ヘルパを共有する（§3 コピペ回避）。
 *
 * @param fileNameOf 失敗 toast に出すファイル名の解決子（任意）。未指定時は汎用文言。
 */
export async function flushFileIds(
  fileIds: string[],
  targetType: AttachmentTargetType,
  targetId: string | number,
  fileNameOf?: (fileId: string) => string | undefined,
): Promise<void> {
  for (const fileId of fileIds) {
    try {
      await createAttachment({ targetType, targetId, fileId });
    } catch (e) {
      const name = fileNameOf?.(fileId);
      toast.error(
        extractErrorMessage(
          e,
          name ? `「${name}」の添付に失敗しました` : '添付の追加に失敗しました',
        ),
      );
    }
  }
}
