'use client';

import { AttachmentAddButton } from './task-attachments';
import type { UseDeferredAttachmentsResult } from '../hooks/use-deferred-attachments';

/**
 * 編集面フッタの共通部品（dsk-0428）: 添付追加ボタン＋キャンセル／保存の横一列
 * （.desk-global-input-footer）。テーマ説明・発話編集・コメント編集・タスク説明編集の
 * 4箇所で同型だった構造を抽出した。挙動・見た目は抽出前と同一で、活性条件の面ごとの差は
 * cancelDisabled / saveDisabled / isActive props が担う（saving は全面共通の加算条件）。
 * AttachmentChipsRow は面ごとのレイアウト都合で親側に残す。A1 状態機械・useDeferredAttachments
 * の controller 責務には触らない（本部品は描画とハンドラ中継のみ）。
 */
export function DeferredAttachmentEditFooter({
  attachmentsController,
  onCancel,
  onSave,
  saving,
  isActive,
  cancelDisabled = false,
  saveDisabled = false,
  saveLabel = '保存',
}: {
  /** 保留添付 controller（AttachmentAddButton へそのまま渡す）。 */
  attachmentsController: UseDeferredAttachmentsResult;
  onCancel: () => void;
  onSave: () => void;
  /** 保存処理中（キャンセル・保存とも非活性化し aria-busy を立てる）。 */
  saving: boolean;
  /** 保存ボタンの is-active クラス付与条件（面ごとの dirty / 非空条件）。 */
  isActive: boolean;
  /** saving に加算するキャンセル非活性の追加条件（面ごとの差）。 */
  cancelDisabled?: boolean;
  /** saving に加算する保存非活性の追加条件（面ごとの差）。 */
  saveDisabled?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="desk-global-input-footer">
      <AttachmentAddButton controller={attachmentsController} />
      <div className="desk-thread-head-edit-actions">
        <button
          type="button"
          className="desk-ticket-btn desk-ticket-btn-ghost"
          onClick={onCancel}
          disabled={saving || cancelDisabled}
        >
          キャンセル
        </button>
        <button
          type="button"
          className={`desk-global-input-send${isActive ? ' is-active' : ''}`}
          onClick={onSave}
          disabled={saving || saveDisabled}
          aria-busy={saving}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
