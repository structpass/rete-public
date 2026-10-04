'use client';
import {
  PendingAddButton,
  PendingChipsRow,
} from '@/features/desk/components/pending-attachment-field';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import { usePendingAttachments } from '@/features/desk/hooks/use-pending-attachments';
import { extractMentionAccountIds } from '@/features/desk/lib/mentions';
import { isRichTextEmpty, validateMessageInput } from '@/features/desk/lib/validations';
import { useEffect, useState } from 'react';

/**
 * 左スレッド列下部のコメント入力欄。本文を投稿してタスクコメント（スレッド投稿物・dsk-0214）を追加する。
 * ファイル添付（dsk-0249）は deferred-flush でコメント＝投稿物へ紐づく（チャット返信 ReplyComposer と対称・
 * 旧実装はタスク本体へ即時添付していたバグを是正）。タスク本体（チケット）への添付は右列ファイル節が担い、
 * 本コンポーザの添付経路とは分離する（右列＝チケット添付経路は退行しない）。
 * 書式ツールバーはチャット側と共有（desk-rte-toolbar）。Ctrl/Cmd+Enter で送信。
 */
export function DetailCommentComposer({
  onSubmit,
  submitting,
  mentionItems,
  onDirtyChange,
}: {
  /**
   * コメント投稿（dsk-0214）。fileIds は deferred-flush 添付（dsk-0249・コメント＝スレッド投稿物へ紐づく）。
   * mentionAccountIds は本文中の @ メンションから抽出した宛先（dsk-0203・chat ReplyComposer と対称）。
   * 成功（true）で入力欄と保留添付をクリアする。chat 詳細 reply-composer と同方式。
   */
  onSubmit: (body: string, fileIds: string[], mentionAccountIds: string[]) => Promise<boolean>;
  /** 投稿中（送信ボタンを無効化し二重送信を防ぐ）。 */
  submitting: boolean;
  /** @ メンション候補（dsk-0203・チャット側と同じ accounts 由来の {id, label} 列）。 */
  mentionItems: { id: string; label: string }[];
  /**
   * 書きかけコメント（本文あり or 保留添付あり）を上位へ報告する（dsk-0258 / dsk-0249）。チャット詳細の
   * 返信欄（ReplyComposer）が rightDirty へ合流するのと対称に、タスク詳細の leftDirty へ合流させ、書きかけで
   * × / Esc で閉じる時に破棄確認ダイアログ（closeAllGuarded / guardedCloseLeft）の対象にする。
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  // 保留添付（dsk-0249）。コメント投稿が確定するまでローカル保持し、投稿成功時に flush でコメントへ紐づける
  // （チャット返信 ReplyComposer と同パターン）。
  const pendingAttachments = usePendingAttachments();

  // 書きかけ判定（空 HTML は未編集）。保留添付があっても書きかけ扱い（dsk-0249）。dirty を上位（leftDirty）へ
  // 報告する（dsk-0258・ReplyComposer と同方式）。
  const dirty = !isRichTextEmpty(body) || pendingAttachments.pending.length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);
  // アンマウント時は dirty=false を報告し、閉じた後（タブ切替で remount 含む）の誤発火を防ぐ。
  useEffect(() => {
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 空本文 / 文字数上限（CHAT_BODY_MAX）を chat 詳細 reply-composer と同じ validateMessageInput で検査し、
  // 投稿失敗時はローカル error を表示する（送信しても無反応＝サイレント失敗を防ぐ）。成功時のみ入力欄をクリア。
  const handleSubmit = async () => {
    if (submitting) return;
    const validationError = validateMessageInput(body);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    // 保留添付は投稿成功後にコメント（投稿物）へ紐づく（onSubmit→submit が post→flush→reload を一括処理）。
    // 宛先（@ メンション）は確定 HTML から抽出して渡す（dsk-0203・chat ReplyComposer と同型）。
    if (
      await onSubmit(
        body,
        pendingAttachments.pending.map((p) => p.fileId),
        extractMentionAccountIds(body),
      )
    ) {
      setBody('');
      pendingAttachments.clear();
    } else {
      setError('コメントの送信に失敗しました');
    }
  };

  return (
    <div className="desk-global-input">
      {error && <p className="mb-2 text-xs text-[var(--sp-accent-red)]">{error}</p>}
      <div className="desk-global-input-composer">
        {/* 本文は共有リッチエディタ（Tiptap / ADR 0019・書式ツールバー内蔵）。Ctrl/Cmd+Enter で送信。
            @ メンション対応（dsk-0203・chat ReplyComposer と対称）。 */}
        <RichTextEditor
          value={body}
          onChange={(v) => {
            setBody(v);
            // 入力を再開したらエラー表示を消す（送信失敗/バリデーションエラーが残り続けないように）。
            if (error) setError(null);
          }}
          ariaLabel="コメント"
          placeholder="スレッドに返信"
          minRows={3}
          enableMention
          mentionItems={mentionItems}
          onSubmitShortcut={() => void handleSubmit()}
        />
        {/* 保留ファイルのチップは本文直下の専用行へ（送信ボタン行とは分離・ReplyComposer と同方式）。 */}
        <PendingChipsRow
          pending={pendingAttachments.pending}
          onRemove={pendingAttachments.remove}
          disabled={submitting}
        />
        <div className="desk-global-input-footer">
          {/* ファイル添付（dsk-0249・deferred-flush）。投稿確定まで保留し、送信成功時にコメントへ紐づける。 */}
          <PendingAddButton onAdd={pendingAttachments.add} disabled={submitting} />
          {/* 入力に応じて is-active で活性化（chat reply-composer と同じ出し分け）。空/投稿中は無効。 */}
          <button
            type="button"
            className={`desk-global-input-send${isRichTextEmpty(body) ? '' : ' is-active'}`}
            onClick={() => void handleSubmit()}
            disabled={submitting || isRichTextEmpty(body)}
            aria-busy={submitting}
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
