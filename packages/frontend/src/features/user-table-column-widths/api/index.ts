import type { TableId, UserTableColumnWidthResponseDto } from '@rete/shared';
import apiClient from '@/lib/api-client';

/**
 * 列幅 1 行の応答形。形の正本は @rete/shared の `types/user-table-column-width`（v2-245 で集約）で、
 * 本名は画面側の既存参照を保つための別名。userId は自分自身のデータなので返らない（DTO 側で省略済）。
 */
export type UserTableColumnWidth = UserTableColumnWidthResponseDto;

const BASE = '/user-table-column-widths';

export async function fetchColumnWidths(tableId: TableId): Promise<UserTableColumnWidth[]> {
  const res = await apiClient.get(`${BASE}/${tableId}`);
  return (res.data.data as UserTableColumnWidth[]) ?? [];
}

export async function upsertColumnWidth(
  tableId: TableId,
  columnKey: string,
  width: number,
): Promise<UserTableColumnWidth> {
  const res = await apiClient.put(`${BASE}/${tableId}/${encodeURIComponent(columnKey)}`, {
    width,
  });
  // backend は ok(dto) で包む → res.data.data が DTO 本体
  return res.data.data as UserTableColumnWidth;
}

/**
 * 指定テーブルの保存済み列幅を全削除し、既定へリセットする（fil-0054）。
 * 削除後は getMine が空配列を返し、再読込しても DEFAULT_WIDTHS が使われる。
 */
export async function resetColumnWidths(tableId: TableId): Promise<void> {
  await apiClient.delete(`${BASE}/${tableId}`);
}
