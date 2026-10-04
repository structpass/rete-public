'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { AttachmentSource, PendingAttachment } from '../hooks/use-pending-attachments';
import { AttachmentChip } from './attachment-chip';
import { FilePickerOverlay } from './file-picker-overlay';

/**
 * 保留ファイルのチップ一覧（rete-desk-0070 で「追加ボタン」と分離）。
 * 添付がある時だけ描画し、上部に境界線を引いて本文との境を明示する（rete-desk-0066）。
 * コンポーザでは送信/添付ボタンの行とは別行（本文直下）に置き、チップ増加で送信ボタン位置が
 * 動かないようにする（0070）。添付なしでは何も描画しない（null）。
 */
export function PendingChipsRow({
  pending,
  onRemove,
  disabled = false,
  flush = false,
}: {
  pending: PendingAttachment[];
  onRemove: (fileId: string) => void;
  disabled?: boolean;
  /** true で上部境界線・帯余白なし（お知らせのファイル欄など、ラベル直下に置く箇所用・hom-0101）。 */
  flush?: boolean;
}) {
  if (pending.length === 0) return null;
  return (
    <div className={flush ? 'desk-pending-chips is-flush' : 'desk-pending-chips'}>
      {pending.map((p) => (
        <AttachmentChip
          key={p.fileId}
          name={p.fileName}
          linked={p.source === 'repo'}
          onRemove={() => onRemove(p.fileId)}
          removeLabel={`${p.fileName} を取り消し`}
          removeDisabled={disabled}
        />
      ))}
    </div>
  );
}

/**
 * ファイル添付トリガ（rete-desk-0070 で「チップ行」と分離）。固定幅のボタンなので、コンポーザの
 * フッタ行（送信ボタンと同列）に置いても行高・送信位置を揺らさない。File ピッカーで保留へ追加する。
 */
export function PendingAddButton({
  onAdd,
  disabled = false,
}: {
  onAdd: (fileId: string, fileName: string, source: AttachmentSource) => void;
  /** 送信中など（true でファイル追加を抑止）。 */
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={disabled}
        className="desk-pending-add"
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        <span>ファイル添付</span>
      </button>
      {pickerOpen && (
        <FilePickerOverlay
          onPick={(fileId, fileName, source) => {
            onAdd(fileId, fileName, source);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

/**
 * deferred-flush 添付の入力欄（FL-3b）。チップ一覧 + 追加ボタンを縦に積む結合形。
 * タスク新規/昇格フォームの属性帯（縦フィールド）で使う。コンポーザのフッタでは送信ボタンと行を
 * 共有しないよう {@link PendingChipsRow} と {@link PendingAddButton} を別配置する（rete-desk-0070）。
 */
export function PendingAttachmentField({
  pending,
  onAdd,
  onRemove,
  disabled = false,
  flush = false,
}: {
  pending: PendingAttachment[];
  onAdd: (fileId: string, fileName: string, source: AttachmentSource) => void;
  onRemove: (fileId: string) => void;
  /** 送信中など（true でファイル追加・取り消しを抑止）。 */
  disabled?: boolean;
  /** チップ行の上部境界線・帯余白を消す（{@link PendingChipsRow} へ透過・hom-0101）。 */
  flush?: boolean;
}) {
  return (
    <div className="desk-pending-files">
      <PendingChipsRow pending={pending} onRemove={onRemove} disabled={disabled} flush={flush} />
      <PendingAddButton onAdd={onAdd} disabled={disabled} />
    </div>
  );
}
