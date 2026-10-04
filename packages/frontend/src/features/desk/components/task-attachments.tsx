'use client';

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { Spinner } from '@/components/ui/spinner';
import { useDeskAttachments, type UseDeskAttachmentsResult } from '../hooks/use-desk-attachments';
import { isPendingAttachment } from '../lib/attachment-status';
import { useAttachmentDownload } from '../hooks/use-attachment-download';
import type { Attachment, AttachmentTargetType } from '../lib/api';
import {
  findDuplicateAttachmentName,
  DUPLICATE_ATTACHMENT_NAME_MESSAGE,
} from '../lib/attachment-duplicate';
import { AttachmentChip } from './attachment-chip';
import { FilePickerOverlay } from './file-picker-overlay';

/**
 * 添付の読み取り専用一覧（FL-3b）。チャットの既存メッセージ／テーマ起点カードのように、解除・追加を
 * 伴わず「付いている添付を見せるだけ」の局面で使う（add/remove を持つ AttachmentPanel と用途分離）。
 * 行体裁は AttachmentPanel・コンポーザ保留チップと共通の {@link AttachmentChip}（.desk-pending-file 系）で揃える。
 */
export function AttachmentList({ items }: { items: Attachment[] }) {
  const { isDownloading, download } = useAttachmentDownload();
  if (items.length === 0) return null;
  return (
    <div className="desk-ticket-files desk-ticket-files-readonly">
      {items.map((att) => (
        <AttachmentChip
          key={att.id}
          name={att.fileName}
          title={`v${att.versionNo}・${att.attachedBy}`}
          onDownload={() => download(att)}
          downloading={isDownloading(att.id)}
        />
      ))}
    </div>
  );
}

/**
 * 添付チップ列の 3 状態描画（読み込み中スピナー・エラー・チップ列）。dsk-0425: AttachmentChipsRow と
 * AttachmentPanel で丸ごと二重だった描画を共通化した内部コンポーネント。親が枠（.desk-ticket-files）を
 * 持つ想定で、空のときは何も描画しない（枠ごと消すかどうかは呼び出し側の責務＝AttachmentChipsRow が
 * 添付ゼロで枠ごと null を返すのを維持する）。
 */
function AttachmentChipList({ controller }: { controller: UseDeskAttachmentsResult }) {
  const { attachments, loading, error, mutating, remove } = controller;
  const { isDownloading, download } = useAttachmentDownload();
  return (
    <>
      {loading && (
        <div className="desk-ticket-file-state">
          <Spinner className="h-4 w-4" />
        </div>
      )}
      {error && (
        <p role="alert" className="desk-ticket-file-error">
          {error}
        </p>
      )}
      {!loading &&
        !error &&
        attachments.map((att) => (
          <AttachmentChip
            key={att.id}
            name={att.fileName}
            // 保留チップ（useDeferredAttachments の未確定分・dsk-0265）は版・添付者がまだ無く、
            // 確定前のためダウンロード導線も出さない（コンポーザの PendingChipsRow と同方針）。
            title={
              isPendingAttachment(att) ? '保存時に確定' : `v${att.versionNo}・${att.attachedBy}`
            }
            onDownload={isPendingAttachment(att) ? undefined : () => download(att)}
            downloading={isDownloading(att.id)}
            onRemove={() => remove(att.id)}
            removeLabel={`${att.fileName} を解除`}
            removeDisabled={mutating}
          />
        ))}
    </>
  );
}

/**
 * 添付チップ（一覧 + 解除）のみの行。追加ボタンを別の場所（コンポーザ枠フッタ等）へ置きたい局面で
 * AttachmentAddButton と分割して使う（rete-desk-0132: テーマ編集の添付/キャンセル/保存 一列化）。
 * チップが 1 件も無く loading/error も無い時は何も描画しない（空の余白を作らない）。
 */
export function AttachmentChipsRow({ controller }: { controller: UseDeskAttachmentsResult }) {
  const { attachments, loading, error } = controller;
  if (!loading && !error && attachments.length === 0) return null;
  return (
    <div className="desk-ticket-files">
      <AttachmentChipList controller={controller} />
    </div>
  );
}

/**
 * ファイル選択時の同名チェック→トースト→追加→ピッカー閉じ。dsk-0425: AttachmentAddButton と
 * AttachmentPanel で同一だった handlePick を共通化した内部関数。ピッカー開閉 state は呼び出し側が
 * useState で持ち setPickerOpen を渡す（既存の各コンポーネントの state 構造を変えない）。
 */
async function handleAttachmentPick(
  controller: UseDeskAttachmentsResult,
  setPickerOpen: (open: boolean) => void,
  fileId: string,
  fileName: string,
): Promise<void> {
  const { attachments, add } = controller;
  // 同名の確定済み添付が既にあればサーバへ投げずに弾く（ピッカーを閉じてトースト通知・dsk-0273）。
  if (findDuplicateAttachmentName(attachments, fileName)) {
    setPickerOpen(false);
    toast.error(DUPLICATE_ATTACHMENT_NAME_MESSAGE);
    return;
  }
  const added = await add(fileId, fileName);
  if (added) setPickerOpen(false);
}

/**
 * 「ファイル添付」ボタン + File ピッカー起動。dsk-0425: AttachmentAddButton と AttachmentPanel で
 * 同一だったボタン JSX・ピッカー開閉 state・handlePick 配線を共通化した内部コンポーネント。
 * 本ファイル内の AttachmentAddButton / AttachmentPanel から使う（非公開・rete-desk-0132 の分割需要を満たす
 * 際はこの内部部品を export する）。
 */
function AttachmentPickerButton({ controller }: { controller: UseDeskAttachmentsResult }) {
  const { attachments, mutating } = controller;
  const [pickerOpen, setPickerOpen] = useState(false);

  // fileName も渡す（保留実装＝useDeferredAttachments が確定前チップの表示名に使う・即時実装は無視 / dsk-0265）。
  const handlePick = (fileId: string, fileName: string) =>
    handleAttachmentPick(controller, setPickerOpen, fileId, fileName);

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={mutating}
        className="desk-ticket-file-add is-borderless"
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        <span>ファイル添付</span>
      </button>
      {pickerOpen && (
        <FilePickerOverlay
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
          busy={mutating}
          isDuplicateName={(name) => !!findDuplicateAttachmentName(attachments, name)}
        />
      )}
    </>
  );
}

/**
 * 「ファイル添付」トリガボタン + File ピッカー起動（AttachmentChipsRow と対の分割部品）。
 */
export function AttachmentAddButton({ controller }: { controller: UseDeskAttachmentsResult }) {
  return <AttachmentPickerButton controller={controller} />;
}

/**
 * 添付一覧の表示・解除・追加（プレゼンテーション）。useDeskAttachments の結果（controller）を受けて描画する。
 * 同一対象への add を複数の入口（一覧の「追加」ボタン／タスク詳細コメント欄の Paperclip）で共有するため、
 * hook の所有を呼び出し側へ寄せられるよう controller を外から渡す形にする（§3 二重 hook の状態ズレ回避）。
 */
export function AttachmentPanel({ controller }: { controller: UseDeskAttachmentsResult }) {
  return (
    <div className="desk-ticket-files">
      <AttachmentChipList controller={controller} />
      <AttachmentPickerButton controller={controller} />
    </div>
  );
}

/**
 * Desk 添付欄（FL-3）。タスク詳細／チャットの「ファイル」節に置き、添付一覧の表示・解除と
 * 「ファイルを追加」（File ピッカー起動 → 添付作成）を担う。targetType で task / chatMessage / theme を切替。
 * hook を内部で所有する自己完結版（既存メッセージへの後付け添付など、共有不要な単独利用向け）。
 * 元 rete-desk-0047（非機能だった「ファイルを追加」ボタン）の実機能化。
 */
export function TaskAttachments({
  targetType,
  targetId,
}: {
  targetType: AttachmentTargetType;
  targetId: string | number;
}) {
  const controller = useDeskAttachments({ targetType, targetId });
  return <AttachmentPanel controller={controller} />;
}
