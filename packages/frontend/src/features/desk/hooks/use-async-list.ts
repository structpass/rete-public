'use client';

import { useState, useEffect, useCallback } from 'react';

export interface UseAsyncListResult<T> {
  items: T[];
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
}

/**
 * 「マウント時に配列を 1 度取得して保持する」だけの軽量リスト hook の共通実装（§3/§6 共通化）。
 * useOrganizations / useProjects / useSpaces が逐語的に重複するため先に抽出した（useAccounts 系と同方針だが、
 * 3 つで共有するためこちらは generic helper として切り出す）。
 *
 * fetcher は呼び出し側で useCallback により安定参照にすること（依存が変われば再取得される）。
 * エラーはサイレント（error フラグのみ）。トースト等の通知方針は呼び出し側に委ねる。
 */
export function useAsyncList<T>(fetcher: () => Promise<T[]>): UseAsyncListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 手動 reload（UI 起点の単発再取得）。逐次操作前提なので stale race は実害なし。
  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetcher());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  // マウント / fetcher 変更時の取得。fetcher が飛行中に変わると旧 fetch が後から resolve し得るため、
  // ignore フラグで cleanup し古いレスポンスで新しい state を上書きしない（stale response race 防止）。
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(false);
    fetcher().then(
      (data) => {
        if (!ignore) {
          setItems(data);
          setLoading(false);
        }
      },
      () => {
        if (!ignore) {
          setError(true);
          setLoading(false);
        }
      },
    );
    return () => {
      ignore = true;
    };
  }, [fetcher]);

  return { items, loading, error, reload };
}
