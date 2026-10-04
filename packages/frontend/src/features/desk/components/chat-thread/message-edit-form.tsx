'use client';
import { DeferredAttachmentEditFooter } from '@/features/desk/components/deferred-attachment-edit-footer';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import { AttachmentChipsRow } from '@/features/desk/components/task-attachments';
import { type UseDeferredAttachmentsResult } from '@/features/desk/hooks/use-deferred-attachments';
import { extractMentionAccountIds } from '@/features/desk/lib/mentions';
import { isRichTextEmpty, validateMessageInput } from '@/features/desk/lib/validations';
import { useEffect, useState } from 'react';

/**
 * 自分の発話の本文編集フォーム（rete-desk-0146）。本文 RTE のみ（題名・添付は持たない・編集対象は本文と宛先）。
 * テーマ編集（ThemeEditForm）と同じ RTE 基盤・破棄ガード方式を踏襲し、保存で onSave → 成功で
 * スレッド再取得（呼び出し側）。キャンセルは dirty ガード（破棄確認）を通す。
 */
export function MessageEditForm({
  initialBody,
  saving,
  error,
  attachmentsController,
  mentionItems,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  initialBody: string;
  saving: boolean;
  error: string | null;
  /** 発話添付（dsk-0250 → dsk-0265 で保留方式化）。add/remove は保留に積み、保存時に親が commit する。 */
  attachmentsController: UseDeferredAttachmentsResult;
  /** 本文中の @ メンション候補（id=accountId / label=表示名 / rete-desk-0116）。 */
  mentionItems: { id: string; label: string }[];
  onSave: (payload: { body: string; mentionAccountIds: string[] }) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 空 HTML の表記揺れ（'' と '<p></p>' 等）は未編集扱い（rete-desk-0134 と同方針）。双方が「空」なら
  // 文字列が違っても未編集とみなし、何も編集していないのに破棄確認が出る誤判定を防ぐ。
  // 添付の保留変更（追加・解除・dsk-0265）も dirty に合流させ、本文未編集でも破棄確認を通す。
  const dirty =
    (body !== initialBody && !(isRichTextEmpty(body) && isRichTextEmpty(initialBody))) ||
    attachmentsController.dirty;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = () => {
    const err = validateMessageInput(body);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    // 宛先（mentionAccountIds）は本文中の @ メンションから再抽出して全置換する（backend が delete+createMany）。
    onSave({ body, mentionAccountIds: extractMentionAccountIds(body) });
  };

  return (
    <div className="desk-thread-comment-edit">
      {(validationError || error) && (
        <p role="alert" className="mb-2 text-xs text-[var(--sp-accent-red)]">
          {validationError ?? error}
        </p>
      )}
      <div className="desk-global-input-composer">
        <RichTextEditor
          value={body}
          onChange={setBody}
          ariaLabel="発話本文"
          placeholder="本文"
          minRows={3}
          onSubmitShortcut={handleSave}
          enableMention
          mentionItems={mentionItems}
        />
        {/* 発話添付（dsk-0250 → dsk-0265 で保留方式化）。追加・解除は保存まで確定しない。
            チップ行とトリガのフッタ分割は ThemeEditForm と同型。 */}
        <AttachmentChipsRow controller={attachmentsController} />
        <DeferredAttachmentEditFooter
          attachmentsController={attachmentsController}
          onCancel={onCancel}
          onSave={handleSave}
          saving={saving}
          isActive={!isRichTextEmpty(body)}
          cancelDisabled={isRichTextEmpty(body)}
          saveDisabled={isRichTextEmpty(body)}
        />
      </div>
    </div>
  );
}
