import type { AttachmentDto } from '@rete/shared';

/**
 * Desk 添付の Response DTO（§1 DTO 境界）。Prisma Entity を直返しせず本 DTO を経由する。
 * shape の正本は @rete/shared AttachmentDto（cmn-0015・§5 shared 型整合）。
 * 添付は「添付時点の版」を固定して指す（versionNo / byteSize / mimeType は固定された FileVersion 由来）。
 * fileId は添付元ファイル（最新版の DL 等に使える）。Date 系は mapper で ISO 8601 文字列化、
 * byteSize は BigInt → number 変換（ファイルサイズは 2^53 内）。
 */
export type AttachmentResponseDto = AttachmentDto;
