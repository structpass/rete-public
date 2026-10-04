'use client';
import { Spinner } from '@/components/ui/spinner';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import type { useChatThreadController } from '@/features/desk/hooks/use-chat-thread-controller';
import type { ChatThreadProps } from '@/features/desk/lib/chat-thread-types';
type Props = Pick<
  ReturnType<typeof useChatThreadController>,
  | 'showSpinner'
  | 'tenmatsuDraft'
  | 'setTenmatsuDraft'
  | 'tenmatsuSaving'
  | 'tenmatsuError'
  | 'tenmatsuDirty'
  | 'mentionItems'
  | 'handleSaveTenmatsu'
> &
  Pick<ChatThreadProps, 'theme' | 'error'>;
export function ChatThreadOutcome({
  theme,
  error,
  showSpinner,
  tenmatsuDraft,
  setTenmatsuDraft,
  tenmatsuSaving,
  tenmatsuError,
  tenmatsuDirty,
  mentionItems,
  handleSaveTenmatsu,
}: Props) {
  return (
    <div className="desk-pane-body">
      {/* 顛末タブは他の入力欄（説明・返信）と同じ RTE（書式ツールバー付き）で結論を記録する
              （rete-desk-0092 / 0091 で plain textarea → RTE HTML 化）。保存で ChatTheme.tenmatsu へ
              HTML 永続化し（backend が description と同じ sanitize 経路を通す）、再オープンで再表示される。
              顛末は所有者ゲートを掛けない（rete-desk-0122: 決着を付けて顛末を記すのは投稿者本人とは
              限らない。誰でもいつでも記録できる運用が正。backend も顛末のみ更新は 403 を免除済）。 */}
      {showSpinner || !theme ? (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      ) : error ? (
        <p className="p-4 text-sm text-[var(--sp-accent-red)]">{error}</p>
      ) : (
        <div className="desk-tenmatsu-edit">
          <RichTextEditor
            value={tenmatsuDraft}
            onChange={setTenmatsuDraft}
            ariaLabel="顛末"
            placeholder="このスレッドの顛末を記録します"
            minRows={6}
            disabled={!theme || tenmatsuSaving}
            enableMention
            mentionItems={mentionItems}
          />
          {tenmatsuError && (
            <p role="alert" className="desk-tenmatsu-error">
              {tenmatsuError}
            </p>
          )}
          <div className="desk-thread-head-edit-actions">
            <button
              type="button"
              className={`desk-global-input-send${tenmatsuDirty ? ' is-active' : ''}`}
              onClick={() => void handleSaveTenmatsu()}
              disabled={!theme || tenmatsuSaving || !tenmatsuDirty}
              aria-busy={tenmatsuSaving}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
