'use client';
import { DeferredAttachmentEditFooter } from '@/features/desk/components/deferred-attachment-edit-footer';
import { Avatar } from '@/features/desk/components/desk-avatar';
import { InertBtn } from '@/features/desk/components/desk-rte-toolbar';
import { ReactionBar } from '@/features/desk/components/reaction-bar';
import { RichTextEditor } from '@/features/desk/components/rich-text-editor';
import { RichTextView } from '@/features/desk/components/rich-text-view';
import { AttachmentChipsRow } from '@/features/desk/components/task-attachments';
import type { useTaskDetailController } from '@/features/desk/hooks/use-task-detail-controller';
import type { TaskDetailOverlayProps } from '@/features/desk/lib/task-detail-types';
import { highlightMatches } from '@/lib/highlight';
import { formatDateTime } from '@/lib/utils';
import { MoreHorizontal, Pencil } from 'lucide-react';
type Props = Pick<
  ReturnType<typeof useTaskDetailController>,
  | 'mentionItems'
  | 'attachmentsCtl'
  | 'saveError'
  | 'editingHead'
  | 'setEditingHead'
  | 'headTitle'
  | 'setHeadTitle'
  | 'headDescription'
  | 'setHeadDescription'
  | 'handleHeadSave'
  | 'handleHeadCancel'
  | 'creatorLabel'
  | 'isHeadOwner'
> &
  Pick<TaskDetailOverlayProps, 'saving' | 'taskKeyword' | 'onToggleReaction'> & {
    task: NonNullable<TaskDetailOverlayProps['task']>;
  };
export function TaskDetailHead({
  task,
  saving,
  taskKeyword,
  onToggleReaction,
  mentionItems,
  attachmentsCtl,
  saveError,
  editingHead,
  setEditingHead,
  headTitle,
  setHeadTitle,
  headDescription,
  setHeadDescription,
  handleHeadSave,
  handleHeadCancel,
  creatorLabel,
  isHeadOwner,
}: Props) {
  return (
    <div className="desk-thread-head">
      <div className="desk-thread-head-meta">
        {/* dsk-0271/dsk-0268: 起点カードの投稿者は作成者（owner）。以前は担当者（assignee）を
                          表示していたため、担当者変更で投稿者名が変わり「他人の投稿を自分が編集できる」ように
                          見えていた（編集ゲート isHeadOwner は owner 基準で元から正しい＝表示だけの取り違え）。
                          履歴タブの作成行（dsk-0235）と同じく owner 固定・未取得は '—' で中立フォールバック。 */}
        <Avatar
          author={{
            id: task.owner?.id ?? 'owner-unknown',
            name: creatorLabel ?? '—',
          }}
          size={1.5}
        />
        <span className="desk-thread-head-name">{creatorLabel ?? '—'}</span>
        <span className="desk-thread-head-time">{formatDateTime(task.createdAt)}</span>
        {/* 編集ボタン: 起点カードの題名 + 説明をインライン編集する（rete-desk-0189）。
                          dsk-0244: 作成者本人（isHeadOwner）のときだけ表示。他人のタスクでは編集導線を出さない。
                          dsk-0343: 隣の「その他」（InertBtn・見た目のみ）も同じゲートに揃える。以前は無条件表示で
                          他人タスクでも編集できそうに見えていた取りこぼしを塞ぐ。編集モード中も同様に隠す。 */}
        {!editingHead && isHeadOwner && (
          <>
            <button
              type="button"
              aria-label="編集"
              className="desk-thread-head-icon-btn"
              onClick={() => {
                setHeadTitle(task.title);
                setHeadDescription(task.description ?? '');
                setEditingHead(true);
              }}
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <InertBtn label="その他" className="desk-thread-head-icon-btn">
              <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            </InertBtn>
          </>
        )}
      </div>
      {editingHead ? (
        // インライン編集（chat のテーマ編集 ThemeEditForm と同じ意匠・RTE 基盤）。
        // 題名 input + 説明 RTE（@ メンション対応・dsk-0203）+ キャンセル / 保存。
        <div className="desk-thread-head-edit">
          {saveError && (
            <p role="alert" className="mb-2 text-xs text-[var(--sp-accent-red)]">
              {saveError}
            </p>
          )}
          <input
            type="text"
            aria-label="タスク題名"
            className="desk-thread-head-title-input"
            value={headTitle}
            maxLength={500}
            onChange={(e) => setHeadTitle(e.target.value)}
            placeholder="題名"
          />
          <div className="desk-global-input-composer">
            <RichTextEditor
              value={headDescription}
              onChange={setHeadDescription}
              ariaLabel="タスク説明"
              placeholder="説明"
              minRows={4}
              enableMention
              mentionItems={mentionItems}
            />
            {/* dsk-0349: 説明欄フッタにファイル添付（メッセージ系とパリティ）。
                              右列 AttachmentPanel と同一 attachmentsCtl を共有＝双方向同期。
                              確定は右列「更新」の commitAttachments（useDeferredAttachments）。 */}
            <AttachmentChipsRow controller={attachmentsCtl} />
            <DeferredAttachmentEditFooter
              attachmentsController={attachmentsCtl}
              onCancel={handleHeadCancel}
              onSave={handleHeadSave}
              saving={saving}
              isActive={!!headTitle.trim()}
              saveDisabled={!headTitle.trim()}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="desk-thread-head-title-row">
            <h4 className="desk-thread-head-title">{highlightMatches(task.title, taskKeyword)}</h4>
          </div>
          {/* 説明はリッチテキスト（HTML）。sanitize して描画（ADR 0019・生タグ露出/XSS 防止）。
                            タスク検索語があれば一致箇所をハイライト（dsk-0339・チャットと同型）。 */}
          <RichTextView
            html={task.description}
            className="desk-thread-head-body"
            highlight={taskKeyword}
          />
          {/* 起点カードへのリアクション（dsk-0297・チャット発話/テーマ ReactionBar と共有コンポーネント）。
                            所有判定なし＝誰でも押せる（criteria）。onToggleReaction 未指定時は描画しない。 */}
          {onToggleReaction && (
            <ReactionBar reactions={task.reactions} onToggle={onToggleReaction} />
          )}
        </>
      )}
    </div>
  );
}
