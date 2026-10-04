'use client';

import type { SearchResultItem, TreeNode } from '../lib/types';
import { SearchResults, type SearchSelection } from './search-results';

/**
 * タグ横断検索のヒット一覧（rete-files-0032）。種類 / 名前 / 場所 の 3 列。
 * fil-0045 にて共通 SearchResults へのラッパーへ整理（タグ固有メッセージを注入）。
 * タグ絞り込みが有効な間だけ通常のフォルダ内容の代わりに右ペインへ出す。
 */
export function TagSearchResults({
  results,
  tree,
  loading,
  error,
  truncated,
  onNavigate,
  onOpenFolder,
  selection,
  keyword,
}: {
  results: SearchResultItem[];
  tree: TreeNode[];
  loading: boolean;
  error: boolean;
  /**
   * true のとき結果が 200件上限に達して切り詰められている（fil-0043）。
   * バナーで「検索結果が200件に制限されています」を表示する。
   */
  truncated: boolean;
  /** ヒット行クリックの遷移先フォルダ id（フォルダ=自身 / ファイル=所属フォルダ）。 */
  onNavigate: (folderId: string) => void;
  /**
   * フォルダ行をダブルクリックした時のハンドラ（fil-0046）。
   * 呼び出し元（files-shell）がフォルダを開きつつタグフィルタを解除するために使う。
   */
  onOpenFolder?: (folderId: string) => void;
  /** id 基点のファイル選択ハンドル（fil-0051）。ツールバー操作を有効化するために通常表示と同型の選択を出す。 */
  selection?: SearchSelection;
  /** 検索ハイライト対象キーワード（fil-0065）。タグ検索は語ベースの一致が無いため通常は未指定。 */
  keyword?: string;
}) {
  return (
    <SearchResults
      results={results}
      tree={tree}
      loading={loading}
      error={error}
      truncated={truncated}
      errorText="タグ検索に失敗しました"
      emptyText="指定したタグの項目はありません"
      truncatedText="⚠ 検索結果が200件に制限されています。タグを絞り込んで再検索してください。"
      onNavigate={onNavigate}
      onOpenFolder={onOpenFolder}
      selection={selection}
      keyword={keyword}
    />
  );
}
