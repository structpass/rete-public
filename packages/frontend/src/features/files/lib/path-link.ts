import type {
  FileItem,
  FileKind,
  FolderCrumb,
  PathLink,
  SearchResultItem,
  TreeNode,
} from './types';
import { MAX_LINKS } from './sample-data';
import { folderPathSegments } from './tree';

/** パンくず区切り（spec §6.2 のパス表記）。 */
export const PATH_SEP = ' ＞ ';

/**
 * 選択項目から「パス付きリンク」を生成する（モック buildLinks 移植 / spec §6.2 構造参照のサンプル表現）。
 * パス = 現在フォルダのパンくず ＞ 項目名。フォルダ＝自身のフルパス、ファイル＝親 ＞ ファイル名 になる。
 *
 * crumb は常に root からの全パス（ADR 0063）。可視性は space（チャネル）単位で、可視 space の
 * フォルダ階層に非可視の祖先は存在しない＝旧 FB+ 時代の「非可視祖先での打ち切り」は撤廃済み。
 */
export function buildLinks(crumb: FolderCrumb[], items: FileItem[]): PathLink[] {
  const base = crumb.map((c) => c.name).join(PATH_SEP);
  return items.map((it) => ({
    kind: it.kind,
    label: it.kind === 'folder' ? 'フォルダ' : 'ファイル',
    path: base + PATH_SEP + it.name,
  }));
}

/**
 * 横断検索ヒットの選択項目から「パス付きリンク」を生成する（fil-0051）。
 * 検索結果は複数フォルダを跨ぐため、現在フォルダのパンくずではなく各項目自身の所属フォルダ（parentFolderId）
 * からツリー上のフルパスを引いてパスを組む（同名衝突を避ける id 基点選択と整合）。
 */
export function buildSearchLinks(
  tree: TreeNode[],
  items: Pick<SearchResultItem, 'kind' | 'name' | 'parentFolderId'>[],
): PathLink[] {
  return items.map((it) => {
    const segs = it.parentFolderId ? folderPathSegments(tree, it.parentFolderId) : [];
    const base = segs.join(PATH_SEP);
    return {
      kind: it.kind as FileKind,
      label: it.kind === 'folder' ? 'フォルダ' : 'ファイル',
      path: base ? base + PATH_SEP + it.name : it.name,
    };
  });
}

/** 上限（MAX_LINKS）で切り詰め、表示分と超過件数を返す（spec §6.3）。 */
export function truncateLinks(
  links: PathLink[],
  max: number = MAX_LINKS,
): { shown: PathLink[]; overflow: number } {
  return { shown: links.slice(0, max), overflow: Math.max(0, links.length - max) };
}

/** HTML 特殊文字をエスケープして literal 表示にする（リッチテキスト HTML へ plain text を埋める前処理）。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 共有本文を組み立てる（FL: ファイル→Desk 導線）。
 *
 * 送信先の Desk テーマ/タスクの description は **リッチテキスト HTML**（ADR 0019・RichTextView が
 * DOMPurify allow-list で sanitize 描画）。説明欄は Desk チャット明細と同じ RichTextEditor（Tiptap）を
 * そのまま流用するため（rete-files-0017）、自由記述は **既に HTML 文字列** として渡る。
 *
 * - パス（`paths`）: file path の literal 文字列なので `escapeHtml` で `<` 等を無害化して `<p>` で包む。
 * - 自由記述（`freeHtml`）: Tiptap が生成した constrained な HTML をそのまま連結する（再エスケープしない）。
 *   生 HTML を埋めるが、保存時 backend `sanitizeRichText` + 描画時 RichTextView の DOMPurify allow-list で
 *   多層 sanitize されるため XSS は成立しない（Desk テーマ/タスク説明と同一パイプライン）。
 *
 * 空判定（空エディタ = `<p></p>` 等）は呼び出し側が `isRichTextEmpty` で行い、空なら `freeHtml=''` を渡す。
 */
export function buildShareDescription(paths: string[], freeHtml: string): string {
  const pathParas = paths.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return pathParas + freeHtml;
}
