'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTaskActivities, type TaskActivityDto } from '../lib/api';

/**
 * タスク変更履歴（監査ログ・dsk-0223・GET /tasks/:id/activities）。属性変更で backend が1行記録した
 * 実データを時系列昇順で取得し、履歴タブが描画する（旧 SAMPLE_HISTORY_EVENTS ダミーを置換）。
 * taskId=null（タスク未確定/ロード中）は無効 id への GET を避けて空状態に留める。投稿系は持たない（読み取り専用）。
 * truncated（dsk-0228）: backend の取得上限（最新200件）で古い側が切れた時 true。履歴タブが注記表示に使う。
 */
export function useTaskActivities(taskId: number | null, revalidateKey?: string | null) {
  const [activities, setActivities] = useState<TaskActivityDto[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // タスク切替後に解決した旧タスクの応答を捨てるガード（use-task-comments の taskIdRef と同方針）。
  const taskIdRef = useRef<number | null>(taskId);
  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  const load = useCallback(async () => {
    if (taskId == null) {
      setActivities([]);
      setTruncated(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { activities: rows, truncated: cut } = await fetchTaskActivities(taskId);
      if (taskId === taskIdRef.current) {
        setActivities(rows);
        setTruncated(cut);
      }
    } catch {
      // 旧タスクの失敗を新タスクの画面へ出さない（成功パスと同じガード）。
      if (taskId === taskIdRef.current) setError('変更履歴の取得に失敗しました');
    } finally {
      // 旧応答の解決で表示中タスクの loading を誤って落とさない。
      if (taskId === taskIdRef.current) setLoading(false);
    }
  }, [taskId]);

  // タスク切替（taskId 変化）に加え、属性保存で task.updatedAt が変わった時も読み直す
  // （保存→記録された変更行が再オープン無しで履歴へ即反映される・revalidateKey=task.updatedAt）。
  useEffect(() => {
    void load();
  }, [load, revalidateKey]);

  return { activities, truncated, loading, error, reload: load };
}
