'use client';
import { DeferredAttachmentEditFooter } from '@/features/desk/components/deferred-attachment-edit-footer';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import { AttachmentChipsRow } from '@/features/desk/components/task-attachments';
import { type UseDeferredAttachmentsResult } from '@/features/desk/hooks/use-deferred-attachments';
import { extractMentionAccountIds } from '@/features/desk/lib/mentions';
import { isRichTextEmpty, validateThemeInput } from '@/features/desk/lib/validations';
import { useEffect, useState } from 'react';

/**
 * テーマ起点カードの編集フォーム（題名 + 説明 RTE）。タスク詳細編集と同じ RTE 基盤を流用する。
 * 保存で onSave → 成功でスレッド再取得（呼び出し側）。キャンセルは dirty ガード（破棄確認）を通す。
 */
export function ThemeEditForm({
  initialTitle,
  initialDescription,
  saving,
  error,
  attachmentsController,
  mentionItems,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  initialTitle: string;
  initialDescription: string;
  saving: boolean;
  error: string | null;
  /** テーマ添付（FL-3b・対象 theme）。add/remove は保留に積み、保存時に親が commit する（dsk-0287）。 */
  attachmentsController: UseDeferredAttachmentsResult;
  /** 説明文中の @ メンション候補（id=accountId / label=表示名 / rete-desk-0116）。 */
  mentionItems: { id: string; label: string }[];
  onSave: (payload: {
    title: string;
    description: string;
    descriptionMentionAccountIds?: string[];
  }) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 空 HTML の表記揺れ（'' と '<p></p>' 等）を編集扱いにしない（rete-desk-0134: 何も編集していないのに
  // 破棄確認が出る誤判定の防止）。双方が「空」なら文字列が違っても未編集とみなす。
  const descriptionDirty =
    description !== initialDescription &&
    !(isRichTextEmpty(description) && isRichTextEmpty(initialDescription));
  // 添付の保留変更（dsk-0287）も dirty に合流させる。添付のみ変更した場合でも保存ボタンが点灯するようにする。
  const dirty = title !== initialTitle || descriptionDirty || attachmentsController.dirty;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = () => {
    const err = validateThemeInput({ title, description });
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    // 説明を変更した時のみ宛先（descriptionMentionAccountIds）を抽出して送る（rete-desk-0116）。
    // 題名のみ変更の保存では undefined のまま＝説明面メンションは据え置き（不要な delete+createMany を避ける）。
    onSave({
      title: title.trim(),
      description,
      ...(descriptionDirty
        ? { descriptionMentionAccountIds: extractMentionAccountIds(description) }
        : {}),
    });
  };

  return (
    <div className="desk-thread-head-edit">
      {(validationError || error) && (
        <p role="alert" className="mb-2 text-xs text-[var(--sp-accent-red)]">
          {validationError ?? error}
        </p>
      )}
      <input
        type="text"
        aria-label="テーマ題名"
        className="desk-thread-head-title-input"
        value={title}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="題名"
      />
      {/* 説明欄はコンポーザ枠（チャット明細のメッセージ入力欄と同じ .desk-global-input-composer）で包み、
          添付チップ → フッタ（ファイル添付 / キャンセル / 保存 横一列）を枠の内側に置く（rete-desk-0132）。 */}
      <div className="desk-global-input-composer">
        <RichTextEditor
          value={description}
          onChange={setDescription}
          ariaLabel="テーマ説明"
          placeholder="説明"
          minRows={4}
          enableMention
          mentionItems={mentionItems}
        />
        {/* テーマ添付（FL-3b）。既存テーマのため即時添付。チップ行と追加トリガを分割し、トリガはフッタへ。 */}
        <AttachmentChipsRow controller={attachmentsController} />
        <DeferredAttachmentEditFooter
          attachmentsController={attachmentsController}
          onCancel={onCancel}
          onSave={handleSave}
          saving={saving}
          isActive={dirty}
          saveDisabled={!dirty}
        />
      </div>
    </div>
  );
}
