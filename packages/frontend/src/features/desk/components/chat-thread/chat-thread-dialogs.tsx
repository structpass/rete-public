'use client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DiscardConfirmDialog } from '@/components/ui/discard-confirm-dialog';
import type { useChatThreadController } from '@/features/desk/hooks/use-chat-thread-controller';
type Props = Pick<
  ReturnType<typeof useChatThreadController>,
  | 'deleteConfirmOpen'
  | 'setDeleteConfirmOpen'
  | 'deleting'
  | 'deleteMessageId'
  | 'setDeleteMessageId'
  | 'deletingMessage'
  | 'discard'
  | 'handleDeleteTheme'
  | 'handleDeleteMessage'
>;
export function ChatThreadDialogs({
  deleteConfirmOpen,
  setDeleteConfirmOpen,
  deleting,
  deleteMessageId,
  setDeleteMessageId,
  deletingMessage,
  discard,
  handleDeleteTheme,
  handleDeleteMessage,
}: Props) {
  return (
    <>
      <DiscardConfirmDialog
        open={discard.open}
        onConfirm={discard.onConfirm}
        onCancel={discard.onCancel}
      />
      {/* スレッド（テーマ起点）削除の確認（rete-desk-0095 / dsk-0374）。
          確定と同時にダイアログを閉じる（失敗時の inline alert がモーダルの背後へ隠れないようにする。
          二重実行は handleDeleteTheme の deleting ガードが防ぐ）。 */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        message="このスレッドを削除しますか？元に戻せません。"
        destructive
        busy={deleting}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          void handleDeleteTheme();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      {/* 発話削除の確認（dsk-0316）。メッセージ語彙のまま（スレッド削除と区別）。 */}
      <ConfirmDialog
        open={deleteMessageId != null}
        message="このメッセージを削除しますか？元に戻せません。"
        destructive
        busy={deletingMessage}
        onConfirm={() => {
          const messageId = deleteMessageId;
          setDeleteMessageId(null);
          if (messageId) void handleDeleteMessage(messageId);
        }}
        onCancel={() => setDeleteMessageId(null)}
      />
    </>
  );
}
