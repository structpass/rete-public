'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchFiles } from '../lib/api';
import type { SearchResultItem } from '../lib/types';

export interface UseFileSearchResult {
  /** 検索が有効か（trim 後の入力が非空）。true の時だけツリー先頭に「検索結果」フォルダを出す。 */
  active: boolean;
  results: SearchResultItem[];
  loading: boolean;
  error: boolean;
  /** 直近の検索を再実行する（移動成功後にヒット一覧を最新化する用）。 */
  refresh: () => void;
}

const DEBOUNCE_MS = 300;

/**
 * 横断検索フック（rete-files-0004）。query を debounce して GET /files/search を叩き、
 * ツリー先頭「検索結果」フォルダ用のヒット配列を返す。入力が空（trim 後）の時は active=false とし、
 * 検索結果フォルダ自体を出さない。連続入力での stale 応答は req 連番で無視し、最新クエリの結果のみ反映する。
 */
export function useFileSearch(query: string): UseFileSearchResult {
  const trimmed = query.trim();
  const active = trimmed.length > 0;

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // 検索実行の競合解決。最後に発行した req 連番と一致する応答のみ反映する。
  const reqIdRef = useRef(0);
  // アンマウント後の setState（React の状態更新警告）を防ぐ。
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (q: string) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const items = await searchFiles(q);
      if (!mountedRef.current || reqId !== reqIdRef.current) return;
      setResults(items);
    } catch {
      if (!mountedRef.current || reqId !== reqIdRef.current) return;
      setResults([]);
      setError(true);
    } finally {
      if (mountedRef.current && reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      // 入力が空に戻ったら結果を破棄し、in-flight 応答も無効化する（reqId を進めて stale 化）。
      reqIdRef.current++;
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    const t = setTimeout(() => void run(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [active, trimmed, run]);

  const refresh = useCallback(() => {
    if (active) void run(trimmed);
  }, [active, trimmed, run]);

  return { active, results, loading, error, refresh };
}
