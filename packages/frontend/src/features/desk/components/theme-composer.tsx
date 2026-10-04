'use client';

import { useMemo, useState } from 'react';
import type { Account } from '@/features/tasks/lib/api';
import { validateThemeInput, THEME_TITLE_MAX, isRichTextEmpty } from '../lib/validations';
import { usePendingAttachments } from '../hooks/use-pending-attachments';
import { PendingChipsRow, PendingAddButton } from './pending-attachment-field';
import { RichTextEditor } from './rich-text-editor';
import { extractMentionAccountIds } from '../lib/mentions';
import { DiscardConfirmDialog } from '@/components/ui/discard-confirm-dialog';
import { useDiscardConfirm } from '@/hooks/use-discard-confirm';

interface ThemeComposerProps {
  /**
   * 作成成功で作成テーマ（id を含む）を返す。失敗は throw（呼び出し側で握らず本コンポーネントが error 表示する）。
   * 返却 id は deferred-flush 添付（FL-3b）の紐付け先に使う。
   * descriptionMentionAccountIds は説明文中の @ メンション宛先（rete-desk-0116）で、テーマ宛先として永続化される。
   */
  onCreate: (input: {
    title: string;
    description?: string;
    descriptionMentionAccountIds?: string[];
  }) => Promise<{ id: string }>;
  /**
   * グローバル入力欄を退避（非表示）するか。モック .desk-global-input.is-evacuated 準拠。
   * オーバーレイ表示中（左≠list or 右=thread）は退避し、各オーバーレイ内の入力欄に主役を譲る。
   */
  evacuated?: boolean;
  /** @ メンション候補（全アカウント / rete-desk-0049）。説明文中で @ 宛先を指定できる（rete-desk-0116）。 */
  accounts: Account[];
}

/**
 * チャット明細（左ペイン）下部に常駐するテーマ作成フォーム。
 * チャットは「テーマ（タイトル付きスレッド）」前提なので、新規投稿＝新テーマ作成。
 */
export function ThemeComposer({ onCreate, evacuated = false, accounts }: ThemeComposerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingAttachments = usePendingAttachments();
  // @ メンション候補（id=accountId / label=表示名）。RichTextEditor の suggestion が参照する（rete-desk-0116）。
  const mentionItems = useMemo(
    () => accounts.map((a) => ({ id: a.id, label: a.name })),
    [accounts],
  );
  // 破棄確認（Rete デザインダイアログ / rete-desk-0102・旧 window.confirm を置換）。
  const discard = useDiscardConfirm();

  // 入力差分（題名/説明/保留添付のいずれか）。キャンセルボタンの表示（未入力時は非表示 / rete-desk-0148）と
  // Esc 破棄確認の発火判定（rete-desk-0079）で共有する。
  const dirty =
    title.trim() !== '' || !isRichTextEmpty(description) || pendingAttachments.pending.length > 0;

  const handleClear = () => {
    setTitle('');
    setDescription('');
    setError(null);
    pendingAttachments.clear();
  };

  // Esc を ×（キャンセル＝クリア）と同じ挙動にする（rete-desk-0079）。入力/添付がある時だけ
  // 破棄確認（Rete デザインダイアログ / rete-desk-0102）。ファイルピッカーが開いて
  // いる時はそちらの Esc を優先し、ここでは何もしない。IME 変換確定中の Esc も無視。
  const handleEscapeCancel = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing || submitting) return;
    if (typeof document !== 'undefined' && document.querySelector('.file-overlay')) return;
    if (!dirty) return;
    e.preventDefault();
    e.stopPropagation();
    // dirty 確定済みのため必ずダイアログを開く（破棄するで handleClear を実行）。
    discard.request(true, handleClear);
  };

  const handleSubmit = async () => {
    const validationError = validateThemeInput({ title, description: description || undefined });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // テーマ作成後に保留ファイルを当該テーマへ deferred-flush 添付（FL-3b・対象は theme）。
      // 説明文中の @ メンションは宛先（descriptionMentionAccountIds）として抽出し、本体作成と同時に永続化（rete-desk-0116）。
      const created = await onCreate({
        title: title.trim(),
        description: description || undefined,
        descriptionMentionAccountIds: extractMentionAccountIds(description),
      });
      await pendingAttachments.flush('theme', created.id);
      setTitle('');
      setDescription('');
    } catch {
      setError('テーマの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`desk-global-input${evacuated ? ' is-evacuated' : ''}`}
      onKeyDown={handleEscapeCancel}
    >
      {/* 文言は共有ダイアログの既定（変更を破棄しますか？）に統一（rete-desk-0127/0128 の重複整理）。 */}
      <DiscardConfirmDialog
        open={discard.open}
        onConfirm={discard.onConfirm}
        onCancel={discard.onCancel}
      />
      {error && <p className="mb-2 text-xs text-[var(--sp-accent-red)]">{error}</p>}
      <div className="desk-global-input-title-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter で送信（rete-desk-0060）。IME 変換確定中は無視。
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="タイトル"
          maxLength={THEME_TITLE_MAX}
          disabled={submitting}
          className="desk-global-input-title"
        />
      </div>
      <div className="desk-global-input-composer">
        {/* 説明は共有リッチエディタ（Tiptap / ADR 0019）。ツールバーは editor 配線で実書式適用。
            composer 枠は外側が持つため .desk-rte の枠は CSS で無効化（globals.css）。 */}
        <RichTextEditor
          value={description}
          onChange={setDescription}
          ariaLabel="説明"
          placeholder="説明"
          minRows={2}
          onSubmitShortcut={() => void handleSubmit()}
          enableMention
          mentionItems={mentionItems}
        />
        {/* 保留ファイルのチップは本文直下の専用行へ（送信ボタン行とは分離・rete-desk-0070）。 */}
        <PendingChipsRow
          pending={pendingAttachments.pending}
          onRemove={pendingAttachments.remove}
          disabled={submitting}
        />
        <div className="desk-global-input-footer">
          {/* ファイル添付（FL-3b・deferred-flush）。作成確定まで保留し、テーマ作成成功時に新テーマへ紐づける。 */}
          <PendingAddButton onAdd={pendingAttachments.add} disabled={submitting} />
          {/* キャンセル + 送信を右側にまとめる（スレッド編集フォームと同デザイン / rete-desk-0148）。
              両ボタンとも常時表示し、題名/説明どちらも空のときだけ disabled（dsk-0350・添付だけでは
              活性にならない・活性条件は title.trim() !== '' || !isRichTextEmpty(description)）。 */}
          <div className="desk-thread-head-edit-actions">
            <button
              type="button"
              className="desk-ticket-btn desk-ticket-btn-ghost"
              onClick={() => discard.request(true, handleClear)}
              disabled={submitting || (title.trim() === '' && isRichTextEmpty(description))}
            >
              キャンセル
            </button>
            {/* 題名または説明のいずれか入力で active（teal）。空は灰色（モック .desk-global-input-send 仕様） */}
            <button
              type="button"
              className={`desk-global-input-send${title.trim() || !isRichTextEmpty(description) ? ' is-active' : ''}`}
              onClick={handleSubmit}
              disabled={submitting || (title.trim() === '' && isRichTextEmpty(description))}
            >
              送信
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
