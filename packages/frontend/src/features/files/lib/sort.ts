import type { FileItem, SortKey, SortDir } from './types';
import { kindLabel } from './format';

function sortValue(item: FileItem, key: SortKey): string {
  if (key === 'kind') return kindLabel(item);
  const v = item[key];
  return v != null ? String(v) : '';
}

/**
 * 一覧のソート（モック sortedItems 移植・非破壊）。
 *
 * - sortKey=null（既定）: フォルダ優先 → 更新日（updatedAt）降順。
 * - sortKey 指定: 当該列を `localeCompare('ja')` で昇降。
 */
export function sortItems(
  items: FileItem[],
  sortKey: SortKey | null,
  sortDir: SortDir,
): FileItem[] {
  if (!sortKey) {
    return [...items].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
    });
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...items].sort(
    (a, b) => sortValue(a, sortKey).localeCompare(sortValue(b, sortKey), 'ja') * dir,
  );
}
