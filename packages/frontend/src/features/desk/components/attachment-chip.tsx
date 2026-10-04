'use client';

import { FileText, Link2, X } from 'lucide-react';

/**
 * 添付ファイルのチップ（presentational）。コンポーザの保留チップ（PendingChipsRow）・添付パネル
 * （AttachmentPanel）・読み取り一覧（AttachmentList）で**同一体裁**を共有する単一ソース。
 * チャット明細コンポーザの体裁（.desk-pending-file 系・解除は X アイコン）を正とし、チャット詳細側の
 * 旧 .desk-ticket-file 系チップが分裂していた問題を解消する（rete-desk-0087 / 0088・§3 / §6）。
 *
 * onRemove を渡した時だけ解除（×）ボタンを出す。読み取り専用一覧では未指定（ボタンを描かない）。
 */
/** チップ共通 props（name + ツールチップ）。 */
interface AttachmentChipBase {
  name: string;
  /** ホバー時のツールチップ（版数・添付者など）。未指定なら name。 */
  title?: string;
  /**
   * Files から選択した参照（リンク）か（rete-desk-0108）。true でリンクアイコン、
   * 既定 false でファイルアイコン（ローカル取り込み・読み取り一覧など出所を区別しない局面）。
   */
  linked?: boolean;
  /**
   * 確定済添付のダウンロード（dsk-0251）。渡すとファイル名がクリック可能（button）になり、押下で実行する。
   * 未指定（pending 保留チップなど）はファイル名を素の span のまま描く（ダウンロード導線なし）。onRemove とは独立。
   */
  onDownload?: () => void;
  /** dsk-0261: 当該添付のダウンロードが実行中か。true の間はボタンを disabled にし連打での並列取得を防ぐ。 */
  downloading?: boolean;
}

/**
 * 解除可否を判別ユニオンで対にする: onRemove を渡すなら removeLabel（aria-label）必須、
 * 渡さない読み取り専用ではどちらも禁止。aria-label なしの解除ボタン生成（a11y 違反）を型で封じる。
 */
type AttachmentChipProps = AttachmentChipBase &
  (
    | { onRemove?: undefined; removeLabel?: undefined; removeDisabled?: undefined }
    | { onRemove: () => void; removeLabel: string; removeDisabled?: boolean }
  );

export function AttachmentChip({
  name,
  title,
  linked = false,
  onDownload,
  downloading = false,
  onRemove,
  removeLabel,
  removeDisabled = false,
}: AttachmentChipProps) {
  const Icon = linked ? Link2 : FileText;
  return (
    <span className="desk-pending-file">
      <Icon className="desk-pending-file-icon h-3.5 w-3.5" aria-hidden="true" />
      {onDownload ? (
        // 確定済添付: ファイル名押下で最新版をダウンロード（dsk-0251）。span と同じ体裁のまま button 化する。
        // dsk-0261: 実行中は disabled にして連打による並列取得を防ぐ（aria-busy で支援技術にも伝える）。
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          aria-busy={downloading}
          className="desk-pending-file-name desk-pending-file-name-download"
          title={title ?? name}
          aria-label={`${name} をダウンロード`}
        >
          {name}
        </button>
      ) : (
        <span className="desk-pending-file-name" title={title ?? name}>
          {name}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          aria-label={removeLabel}
          className="desk-pending-file-remove"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
