'use client';

import {
  Copy,
  Download,
  FolderPlus,
  MessageSquare,
  RotateCcw,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';

/**
 * ツールバー（アップロード / ダウンロード / 新規フォルダ / タグ付け / チャット共有 / クリップボード / 削除）。
 * ダウンロード・チャット共有・クリップボード・削除は選択が 0 件のとき disabled。
 * タグ付けは「1 件以上選択」のとき有効（ファイル/フォルダ混在可・canTagAssign / rete-files-0033/0034）。
 * 1 件＝置換 / 複数＝追加はオーバーレイ側で出し分ける。
 * タグ管理（マスタ）はサイドバーへ移設（rete-files-0009）。
 * お気に入り登録ボタンは撤去（rete-files-0030・rete-files-0023 関連）。★登録は Home 側導線へ寄せる。
 * 削除はツールバー右端（marginLeft:auto で分離）に置く一括削除導線。モック正本は行内アイコンだが、
 * 開発統括判断でツールバー一括削除に寄せた意図的逸脱（docs/decisions 記録）。
 * アップロード（multipart）・ダウンロード（blob 保存）・削除（DELETE API）・新規フォルダ（インライン作成 API）・タグ（CRUD/付与 API）は実挙動。チャット共有は後続フェーズ。
 */
export function FileToolbar({
  selectionCount,
  canTagAssign,
  uploading,
  deleting,
  onUpload,
  onDownload,
  onNewFolder,
  onShareChat,
  onShareClip,
  onTagAssign,
  onReset,
  onDelete,
}: {
  selectionCount: number;
  /** タグ付けボタンの活性（1 件以上選択時 true・ファイル/フォルダ混在可）。 */
  canTagAssign: boolean;
  uploading: boolean;
  deleting: boolean;
  onUpload: () => void;
  onDownload: () => void;
  onNewFolder: () => void;
  onShareChat: () => void;
  onShareClip: () => void;
  onTagAssign: () => void;
  /** ソート順・列幅を既定へリセット（確認なし即実行 / fil-0054）。 */
  onReset: () => void;
  onDelete: () => void;
}) {
  const noSelection = selectionCount === 0;
  return (
    <div className="file-toolbar">
      <button type="button" className="file-tb-btn" onClick={onUpload} disabled={uploading}>
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        {uploading ? 'アップロード中…' : 'アップロード'}
      </button>
      <button type="button" className="file-tb-btn" onClick={onDownload} disabled={noSelection}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        ダウンロード
      </button>
      <button type="button" className="file-tb-btn" onClick={onNewFolder}>
        <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
        新規フォルダ
      </button>
      <button type="button" className="file-tb-btn" onClick={onTagAssign} disabled={!canTagAssign}>
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        タグ付け
      </button>
      <button type="button" className="file-tb-btn" onClick={onShareChat} disabled={noSelection}>
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        チャット共有
      </button>
      <button type="button" className="file-tb-btn" onClick={onShareClip} disabled={noSelection}>
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        クリップボード
      </button>
      <button
        type="button"
        className="file-tb-btn"
        onClick={onReset}
        style={{ marginLeft: 'auto' }}
        title="ソート順と列幅を既定へ戻す"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        リセット
      </button>
      <button
        type="button"
        className="file-tb-btn file-tb-btn-danger"
        onClick={onDelete}
        disabled={noSelection || deleting}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {deleting ? '削除中…' : '削除'}
      </button>
    </div>
  );
}
