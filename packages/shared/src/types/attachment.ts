/**
 * 添付 1 件の共通 shape（cmn-0015・§5 shared 型整合）。
 * backend AttachmentResponseDto / frontend desk Attachment / frontend dashboard AnnouncementAttachment が
 * 完全同一形状を三重に別名定義していたため、ここを唯一の正本にする。
 * 添付は「添付時点の版」を固定して指す（versionNo / byteSize / mimeType は固定された FileVersion 由来）。
 */
export interface AttachmentDto {
  id: string;
  /** 添付元ファイル ID（UUID）。最新版 DL やファイルタブへの導線に使える。 */
  fileId: string;
  /** 添付時点のファイル名（固定版の File.name）。 */
  fileName: string;
  /** 固定された版番号（添付時点の最新版）。 */
  versionNo: number;
  /** 固定版のバイト数（フロントで整形）。 */
  byteSize: number;
  /** 固定版の MIME タイプ。 */
  mimeType: string;
  /** 添付者の表示名。 */
  attachedBy: string;
  /** 添付日時 ISO 8601。 */
  createdAt: string;
}
