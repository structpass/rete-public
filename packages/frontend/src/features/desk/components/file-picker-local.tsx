'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { extractErrorMessage } from '@/lib/error-utils';
import { uploadFile } from '@/features/files/lib/api';
import { DUPLICATE_ATTACHMENT_NAME_MESSAGE } from '../lib/attachment-duplicate';

/** backend hard cap（100 MiB）に対応する frontend 側のサイズ上限（防御的二重チェック）。 */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * 添付ピッカーの [ローカル] タブ（rete-desk-0078・方式A）。
 *
 * ローカル PC のファイルは Files リポジトリに存在しないため、添付（fileId 参照）には取り込みが要る。
 * OS 標準ファイルダイアログ（`<input type=file>`）またはドロップで選んだファイルを、取り込み先フォルダへ
 * 既存の `uploadFile`（multipart・サイズ/拡張子は backend 設定で検証）でアップロードし、返った fileId を
 * そのまま onPick へ渡す。File System Access API は使わず全ブラウザで動く軽量実装に留める。
 *
 * 取り込み先（destFolderId）は親ピッカーが [ファイル] タブで選択中のフォルダ。未選択なら取り込めない。
 */
export function FilePickerLocal({
  destFolderId,
  onPick,
  busy = false,
  isDuplicateName,
}: {
  /** 取り込み先フォルダ id（[ファイル] タブの選択フォルダ。null=取り込み不可）。 */
  destFolderId: string | null;
  onPick: (fileId: string, fileName: string) => void;
  /** 親側の処理中（true で操作抑止）。 */
  busy?: boolean;
  /**
   * 消費側の確定済み添付と同名かを判定する事前チェック（dsk-0290）。アップロード前に呼び、真なら
   * uploadFile を発火せずブロックする（同名は消費側 onPick 後チェックで弾かれる前提で、アップロード
   * 済みの孤児 File が Files に残ってしまうのを防ぐ）。未指定の消費側は従来どおり事前チェック無し。
   */
  isDuplicateName?: (fileName: string) => boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const disabled = busy || uploading || destFolderId == null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (destFolderId == null) {
      setError('取り込み先フォルダがありません。先に [ファイル] タブでフォルダを選んでください');
      return;
    }
    // backend hard cap（100 MiB）に対する frontend 側の二重ガード。無駄な multipart 往復を避ける。
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('ファイルサイズが大きすぎます（上限 100MB）');
      return;
    }
    if (isDuplicateName?.(file.name)) {
      setError(DUPLICATE_ATTACHMENT_NAME_MESSAGE);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const row = await uploadFile(destFolderId, file);
      if (!row.id) {
        setError('取り込んだファイルの識別に失敗しました');
        return;
      }
      onPick(row.id, row.name);
    } catch (e) {
      setError(extractErrorMessage(e, 'ファイルの取り込みに失敗しました'));
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同名連続選択でも change を発火させる。
    void handleFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    void handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="file-picker-local">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
      />
      <button
        type="button"
        className={`file-picker-local-zone${dragOver ? ' is-over' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        disabled={disabled}
      >
        {uploading ? (
          <Spinner className="h-5 w-5" />
        ) : (
          <Upload className="h-6 w-6" aria-hidden="true" />
        )}
        <span className="file-picker-local-title">
          {uploading ? '取り込み中…' : 'ローカルからファイルを選択'}
        </span>
        {/* 通常時の説明ラベルは冗長として撤去（rete-desk-0107）。取り込み先が無い時のみ理由を示す。 */}
        {destFolderId == null && (
          <span className="file-picker-local-hint">取り込み先フォルダがありません</span>
        )}
      </button>
      {error && (
        <p role="alert" className="desk-picker-error">
          {error}
        </p>
      )}
    </div>
  );
}
