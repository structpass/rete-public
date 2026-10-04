import apiClient from '@/lib/api-client';
import { saveBlobAsFile } from '@/lib/save-blob';

/**
 * 確定済の添付（fileId で参照される最新版）を取得してブラウザ保存する（dsk-0251）。
 *
 * backend `GET /files/files/:id/download`（FilesController prefix `files` + route `files/:id/download`）は
 * 最新版を StreamableFile（`Content-Disposition: attachment`・
 * UTF-8 filename 付き）で返す。認証は httpOnly セッション cookie（apiClient は withCredentials）のため、
 * 素の `<a href>` ナビゲーションではなく apiClient で blob を取得し、object URL 経由で保存をトリガする
 * （cross-origin の download 属性無視や未認証時のエラー JSON 表示を避け、失敗を呼び出し側で握れる）。
 *
 * pending（送信前）の保留添付は確定 fileId を持つが「まだ投稿物に紐づかない下書き」のため本関数の対象外
 * （確定済の添付一覧＝AttachmentList / ChipsRow / Panel からのみ呼ぶ）。
 *
 * dsk-0261: blob を一旦メモリに載せる実装は、アップロード時点の hard cap
 * （`UPLOAD_HARD_LIMIT_BYTES` = 100MB・`packages/backend/src/modules/files/files.constants.ts`）で
 * ファイルサイズ自体が律速されるため、ダウンロード側で追加の防御チェックは設けない。
 */
export async function downloadAttachment(att: { fileId: string; fileName: string }): Promise<void> {
  const res = await apiClient.get<Blob>(`/files/files/${att.fileId}/download`, {
    responseType: 'blob',
  });
  // 保存名は添付の原名（従来どおり・サニタイズしない）。revoke は click と同一 tick を避けて次 tick へ回す。
  saveBlobAsFile(res.data, att.fileName, 0);
}
