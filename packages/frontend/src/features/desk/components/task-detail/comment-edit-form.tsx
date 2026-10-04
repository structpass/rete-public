'use client';
import { DeferredAttachmentEditFooter } from '@/features/desk/components/deferred-attachment-edit-footer';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import { AttachmentChipsRow } from '@/features/desk/components/task-attachments';
import { type UseDeferredAttachmentsResult } from '@/features/desk/hooks/use-deferred-attachments';
import { extractMentionAccountIds } from '@/features/desk/lib/mentions';
import { isRichTextEmpty, validateMessageInput } from '@/features/desk/lib/validations';
import { useEffect, useState } from 'react';

/**
 * 自分のコメントの本文編集フォーム（dsk-0241）。チャット発話の MessageEditForm を踏襲し、@ メンションにも
 * 対応する（dsk-0203）。保存時は編集後本文から宛先を再抽出して全置換する（chat 発話編集と同型）。保存で onSave →
 * 成功で編集モード解除（呼び出し側）。空本文 / 文字数上限は投稿欄と同じ validateMessageInput で検査する。
 */
export function CommentEditForm({
  initialBody,
  mentionItems,
  attachmentsController,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  initialBody: string;
  /** @ メンション候補（dsk-0203・チャット側と同じ accounts 由来の {id, label} 列）。 */
  mentionItems: { id: string; label: string }[];
  /**
   * コメント添付（dsk-0279・deferred 方式）。add/remove は保留に積み、保存成功時に呼び出し側が commit、
   * キャンセルで discard する（チャット発話編集 MessageEditForm / dsk-0265 と同型）。
   */
  attachmentsController: UseDeferredAttachmentsResult;
  /** 編集保存。成功（true）で呼び出し側が編集モードを解除する。失敗（false）はフォーム内 inline 表示に留める。 */
  onSave: (body: string, mentionAccountIds: string[]) => Promise<boolean>;
  onCancel: () => void;
  /**
   * 編集差分（本文変更 or 保留添付あり）の上位報告（dsk-0279）。leftDirty へ合流し、書きかけで × / Esc で
   * 閉じる時に破棄確認の対象にする（MessageEditForm が rightDirty へ合流するのと対称）。
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 空 HTML の表記揺れ（'' と '<p></p>' 等）は未編集扱い（rete-desk-0134 と同方針）。添付の保留変更
  // （追加・解除）も dirty に合流させ、本文未編集でも破棄確認を通す（dsk-0265 hook 契約・MessageEditForm と同型）。
  const dirty =
    (body !== initialBody && !(isRichTextEmpty(body) && isRichTextEmpty(initialBody))) ||
    attachmentsController.dirty;
  useEffect(() => {
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);
  // アンマウント時は dirty=false を報告し、編集モードを閉じた後の破棄確認の誤発火を防ぐ。
  useEffect(() => {
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (saving) return;
    const validationError = validateMessageInput(body);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    // 編集後本文から宛先を再抽出して全置換（dsk-0203・chat MessageEditForm と同型）。
    const ok = await onSave(body, extractMentionAccountIds(body));
    setSaving(false);
    if (!ok) setError('コメントの更新に失敗しました');
  };

  return (
    <div className="desk-thread-comment-edit">
      {error && (
        <p role="alert" className="mb-2 text-xs text-[var(--sp-accent-red)]">
          {error}
        </p>
      )}
      <div className="desk-global-input-composer">
        {/* 本文は共有リッチエディタ（Tiptap / ADR 0019）。Ctrl/Cmd+Enter で保存。@ メンション対応（dsk-0203）。 */}
        <RichTextEditor
          value={body}
          onChange={(v) => {
            setBody(v);
            if (error) setError(null);
          }}
          ariaLabel="コメント本文"
          placeholder="コメントを編集"
          minRows={3}
          enableMention
          mentionItems={mentionItems}
          onSubmitShortcut={() => void handleSave()}
        />
        {/* コメント添付（dsk-0279・保留方式）。追加・解除は保存まで確定しない。チップ行とトリガの
            フッタ分割は MessageEditForm（chat 発話編集）と同型。AttachmentAddButton
            （DeferredAttachmentEditFooter 経由で描画）は同名重複チェック（dsk-0273）を内蔵する。 */}
        <AttachmentChipsRow controller={attachmentsController} />
        <DeferredAttachmentEditFooter
          attachmentsController={attachmentsController}
          onCancel={onCancel}
          onSave={() => void handleSave()}
          saving={saving}
          isActive={!isRichTextEmpty(body)}
          cancelDisabled={isRichTextEmpty(body)}
          saveDisabled={isRichTextEmpty(body)}
        />
      </div>
    </div>
  );
}
