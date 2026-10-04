/**
 * UserTableColumnWidth の API レスポンス DTO（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/user-table-column-width` を単一ソースとし、
 * 本ファイルは同名・同形の別名として再公開する（mapper / controller / frontend の import パスは
 * 変えない）。
 *
 * Prisma Entity を直返ししない。userId は自分自身のデータなので冗長のため含めない。
 * tableId の値域（TABLE_IDS のいずれか）は controller が検証する。
 */

export type { UserTableColumnWidthResponseDto } from '@rete/shared';
