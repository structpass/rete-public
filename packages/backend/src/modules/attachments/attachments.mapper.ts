import type { AttachmentResponseDto } from './dto';
import type { AttachmentWithDisplay } from './repositories/attachments.repository';

/**
 * Attachment Entity（固定版 + ファイル名 + 添付者名 include 済）→ Response DTO（§1 DTO 境界・純粋関数）。
 * 添付が指す FileVersion（固定版）から版番号・サイズ・MIME を、その File からファイル名・id を載せる。
 * byteSize は schema 上 BigInt のため JSON 化できる number へ変換する（toFileRow と同方針）。
 */
export function toAttachment(attachment: AttachmentWithDisplay): AttachmentResponseDto {
  const { fileVersion, attachedBy } = attachment;
  return {
    id: attachment.id,
    fileId: fileVersion.file.id,
    fileName: fileVersion.file.name,
    versionNo: fileVersion.versionNo,
    byteSize: Number(fileVersion.byteSize),
    mimeType: fileVersion.mimeType,
    attachedBy: attachedBy.name,
    createdAt: attachment.createdAt.toISOString(),
  };
}
