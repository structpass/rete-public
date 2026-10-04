'use client';

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { fetchTaskTree, type DeskTaskTree } from '../lib/api';

export interface UseTaskTreeResult {
  tree: DeskTaskTree | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** 楽観更新 / ロールバック用にツリーを直接差し替える（D&D 移動が使う）。 */
  setTree: Dispatch<SetStateAction<DeskTaskTree | null>>;
}

/**
 * タスク明細（カテゴリ別ネストツリー）の取得。投稿系の更新後に refetch して表示を同期する。
 * spaceId 指定時はその器のタスクのみ（CM-2 / ADR 0037）。spaceId が変われば自動で取り直す
 * （未指定＝全件＝従来どおり＝安全な中断点）。
 */
export function useTaskTree(spaceId?: string): UseTaskTreeResult {
  const [tree, setTree] = useState<DeskTaskTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTree(await fetchTaskTree(spaceId));
    } catch {
      setError('タスクの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tree, loading, error, refetch: load, setTree };
}
