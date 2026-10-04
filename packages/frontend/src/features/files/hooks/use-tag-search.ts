'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchByTags } from '../lib/api';
import type { SearchResultItem } from '../lib/types';

export interface UseTagSearchResult {
  /** タグ横断検索が有効か（選択タグが 1 つ以上）。true の間は右ペインをヒット一覧へ差し替える。 */
  active: boolean;
  results: SearchResultItem[];
  loading: boolean;
  error: boolean;
  /**
   * 結果が 200件上限に達して切り詰められた場合 true（fil-0043）。
   * true のとき TagSearchResults はバナーで「上限超過」を告知する。
   */
  truncated: boolean;
  /** 直近の検索を再実行する（一括付与後にヒット一覧を最新化する用）。 */
  refresh: () => void;
}

/**
 * タグ横断検索フック（rete-files-0032）。選択タグ集合を GET /files/tags/search に渡し、
 * 指定タグのいずれかを持つフォルダ/ファイルを全ツリーから取得する。テキスト検索（useFileSearch）と違い
 * 操作はトグル（離散）なので debounce はしない。選択が空なら active=false（右ペインは通常のフォルダ内容のまま）。
 *
 * Set は参照で deps 比較されるため、中身を安定キー（ソート済 join）に落として依存に使う。
 * 集合の中身が変わるたび再取得し、連続変更での stale 応答は req 連番で無視する（useFileSearch と同方針）。
 */
export function useTagSearch(tagIds: Set<string>): UseTagSearchResult {
  const key = useMemo(() => [...tagIds].sort().join(','), [tagIds]);
  const active = key.length > 0;

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (ids: string[]) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const { items, truncated: isTruncated } = await searchByTags(ids);
      if (!mountedRef.current || reqId !== reqIdRef.current) return;
      setResults(items);
      setTruncated(isTruncated);
    } catch {
      if (!mountedRef.current || reqId !== reqIdRef.current) return;
      setResults([]);
      setTruncated(false);
      setError(true);
    } finally {
      if (mountedRef.current && reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      // 選択が空に戻ったら結果を破棄し、in-flight 応答も無効化する（reqId を進めて stale 化）。
      reqIdRef.current++;
      setResults([]);
      setTruncated(false);
      setLoading(false);
      setError(false);
      return;
    }
    void run(key.split(','));
  }, [active, key, run]);

  const refresh = useCallback(() => {
    if (active) void run(key.split(','));
  }, [active, key, run]);

  return { active, results, loading, error, truncated, refresh };
}
