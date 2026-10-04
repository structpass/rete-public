import type { FileItem, SortKey, SortDir } from './types';
import { sortItems } from './sort';
import type { FileRowVM } from '../components/file-list';

/**
 * 一覧の表示行（ソート → 検索フィルタ）を導出する。Files ページ本体（files-shell）と添付ピッカー
 * （file-picker-overlay の [ファイル] タブ）の両方が同一ロジックを共有するための純関数
 * （architecture-invariants §3 コピペ禁止 = 逐語コピーを避けて抽出）。
 *
 * srcIndex は元 items 配列上の位置で、ページ側の行 D&D（移動）が参照する。検索は name の部分一致
 * （前後空白除去・小文字化）で、空文字なら全件。
 *
 * タグ絞り込みは当初この関数で現在フォルダ内をクライアント側 OR フィルタしていたが（rete-files-0006）、
 * 「タグで探す＝全ツリー横断検索」へ仕様変更したため（rete-files-0032）本関数からは外し、
 * files-shell の useTagSearch（GET /files/tags/search）へ移管した。
 */
export function buildFileRows(
  items: FileItem[],
  sortKey: SortKey | null,
  sortDir: SortDir,
  search: string,
): FileRowVM[] {
  const sorted = sortItems(items, sortKey, sortDir);
  const q = search.trim().toLowerCase();
  const visible = q ? sorted.filter((it) => it.name.toLowerCase().includes(q)) : sorted;
  return visible.map((item) => ({ item, srcIndex: items.indexOf(item) }));
}
