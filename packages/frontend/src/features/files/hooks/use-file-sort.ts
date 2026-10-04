'use client';

import { useCallback, useState } from 'react';
import type { SortDir, SortKey } from '../lib/types';

export interface UseFileSortResult {
  sortKey: SortKey | null;
  sortDir: SortDir;
  /** 同じ列なら昇降トグル、別列なら当該列の昇順から。 */
  toggleSort: (key: SortKey) => void;
  /** ソートを既定（未ソート・昇順）へ戻す（fil-0054 リセット）。 */
  resetSort: () => void;
}

/** 一覧の列ソート状態（モック sortKey/sortDir + ヘッダクリック移植）。 */
export function useFileSort(): UseFileSortResult {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // setState updater 内で副作用（別 setState）を呼ばない＝StrictMode の二重実行で
  // 方向トグルが 2 回走る反パターンを避ける（fil-0058・use-discard-confirm.ts と同規約）。
  // sortKey を closure から読んで分岐し、setSortKey / setSortDir をハンドラ直下でフラットに呼ぶ。
  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const resetSort = useCallback(() => {
    setSortKey(null);
    setSortDir('asc');
  }, []);

  return { sortKey, sortDir, toggleSort, resetSort };
}
