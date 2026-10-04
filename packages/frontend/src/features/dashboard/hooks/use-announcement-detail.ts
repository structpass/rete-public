'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAnnouncementDetail, type AnnouncementDetail } from '../lib/api';

export interface UseAnnouncementDetailResult {
  detail: AnnouncementDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 通知詳細（1 件・本文込み）の取得。id が null の間は何も取得しない。
 * 一覧 summary には body を含めないため、選択行の本文はこの hook で個別に引く。
 */
export function useAnnouncementDetail(id: string | null): UseAnnouncementDetailResult {
  const [detail, setDetail] = useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 選択切替後に解決した旧 id の応答を捨てるガード（desk 側 use-task-comments の taskIdRef と同方針）。
  const idRef = useRef<string | null>(id);
  useEffect(() => {
    idRef.current = id;
  }, [id]);

  const load = useCallback(async () => {
    if (id == null) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchAnnouncementDetail(id);
      if (id === idRef.current) setDetail(fetched);
    } catch {
      // 旧 id の失敗を表示中の選択へ出さない（成功パスと同じガード）。
      if (id === idRef.current) setError('通知の取得に失敗しました');
    } finally {
      // 旧応答の解決で表示中の loading を誤って落とさない。
      if (id === idRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, loading, error, refetch: load };
}
