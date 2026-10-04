'use client';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import { RichTextView } from '@/features/desk/components/rich-text-view';
import type { useTaskDetailController } from '@/features/desk/hooks/use-task-detail-controller';
import type { TaskDetailOverlayProps } from '@/features/desk/lib/task-detail-types';
type Props = Pick<
  ReturnType<typeof useTaskDetailController>,
  | 'mentionItems'
  | 'tenmatsu'
  | 'setTenmatsu'
  | 'tenmatsuEditing'
  | 'setTenmatsuEditing'
  | 'gateError'
  | 'setGateError'
  | 'tenmatsuDirty'
  | 'handleSaveTenmatsu'
  | 'tenmatsuKeyword'
  | 'showTenmatsuHighlight'
> &
  Pick<TaskDetailOverlayProps, 'saving'>;
export function TaskDetailOutcome({
  saving,
  mentionItems,
  tenmatsu,
  setTenmatsu,
  tenmatsuEditing,
  setTenmatsuEditing,
  gateError,
  setGateError,
  tenmatsuDirty,
  handleSaveTenmatsu,
  tenmatsuKeyword,
  showTenmatsuHighlight,
}: Props) {
  return (
    <div className="desk-pane-body" data-detail-tabpanel="tenmatsu">
      <div className="desk-tenmatsu-edit">
        {/* 顛末は他の入力欄（説明・チャット顛末）と同じ RTE（書式ツールバー付き）で記録する
                      （rete-desk-0190/0192・chat 顛末タブに意匠を統一）。HTML を保持し保存で永続化、
                      backend が description と同じ sanitize 経路を通す。ラベルは非表示（rete-desk-0084）で
                      RTE の aria-label に名前を残す。@ メンション対応（dsk-0203・顛末面）。
                      dsk-0339: 検索語あり時は保存済み HTML を RichTextView+highlight で見せ、編集は RTE。 */}
        {showTenmatsuHighlight ? (
          <>
            <RichTextView
              html={tenmatsu}
              className="desk-thread-head-body desk-tenmatsu-readonly"
              highlight={tenmatsuKeyword}
            />
            <div className="desk-thread-head-edit-actions">
              <button
                type="button"
                className="desk-global-input-send is-active"
                onClick={() => setTenmatsuEditing(true)}
              >
                編集
              </button>
            </div>
          </>
        ) : (
          <>
            <RichTextEditor
              value={tenmatsu}
              onChange={(v) => {
                setTenmatsu(v);
                setGateError(false);
              }}
              ariaLabel="顛末"
              placeholder="タスクの顛末を記録します"
              minRows={6}
              disabled={saving}
              enableMention
              mentionItems={mentionItems}
            />
            {gateError && (
              <p role="alert" className="desk-tenmatsu-error">
                ステータスを「完了」にするには顛末の入力が必要です。
              </p>
            )}
            <div className="desk-thread-head-edit-actions">
              <button
                type="button"
                className={`desk-global-input-send${tenmatsuDirty ? ' is-active' : ''}`}
                onClick={() => void handleSaveTenmatsu()}
                disabled={saving || !tenmatsuDirty}
                aria-busy={saving}
              >
                保存
              </button>
              {tenmatsuKeyword.length > 0 && tenmatsuEditing && !tenmatsuDirty && (
                <button
                  type="button"
                  className="desk-global-input-send"
                  onClick={() => setTenmatsuEditing(false)}
                >
                  キャンセル
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
