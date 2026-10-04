'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchTasks } from '../lib/api';

/**
 * タスク側メンション From/To 絞り込み（dsk-0203）の「一致タスク id 集合」を取得する。
 *
 * タスク明細はツリー（GET /tasks/tree）をクライアント側で絞り込む方式（computeVisibleTaskIds）だが、
 * backend のメンション From/To フィルタはフラット一覧（GET /tasks）にのみ実装されている
 * （tree endpoint の FindTaskTreeDto は spaceId のみ / DESCRIPTION・TENMATSU・COMMENT 面と配下コメントの
 * 集約判定が必要でクライアントでは判定不能）。そこで一致 id 集合だけをサーバーから取得し、
 * ツリーのクライアント絞り込み（TaskFilterCriteria.mentionTaskIds）へ積集合として合流させる。
 *
 * - 両方空（絞り込みなし）は null を返す（フィルタ不適用 = fetch もしない）。
 * - ページングは limit=100（backend PaginationDto 上限）で totalPages まで順次取得して全 id を集める。
 * - 取得中は直前の集合を保持する（ちらつき回避 / stale-while-revalidate）。取得失敗も直前値を据え置く。
 * - 選択変更の競合は seq ref で防ぐ（後発の選択が先発の遅延レスポンスに上書きされない）。
 *
 * 注: コメント投稿などでメンションが増減しても、選択中の From/To が変わらない限り自動再取得はしない
 * （チャット側 server filter も同様に選択変更駆動。必要なら再選択で更新される）。
 */
export function useTaskMentionFilter(
  mentionFrom: string[],
  mentionTo: string[],
): Set<number> | null {
  const [taskIds, setTaskIds] = useState<Set<number> | null>(null);
  // 後発リクエスト優先の世代カウンタ（選択の速い切替で古い結果を反映しない）。
  const seqRef = useRef(0);

  const active = mentionFrom.length > 0 || mentionTo.length > 0;
  // 配列の同値変更（別参照・同内容）での再 fetch を避けるため、deps はソート済み結合キーで取る。
  const fromKey = [...mentionFrom].sort().join(',');
  const toKey = [...mentionTo].sort().join(',');

  useEffect(() => {
    if (!active) {
      // 絞り込み解除は即座に「フィルタなし」へ戻す（進行中の取得は seq で無効化）。
      seqRef.current += 1;
      setTaskIds(null);
      return;
    }
    const seq = (seqRef.current += 1);
    const from = fromKey ? fromKey.split(',') : undefined;
    const to = toKey ? toKey.split(',') : undefined;
    void (async () => {
      try {
        const ids = new Set<number>();
        let page = 1;
        let totalPages = 1;
        do {
          const res = await fetchTasks({ mentionFrom: from, mentionTo: to, page, limit: 100 });
          res.data.forEach((t) => ids.add(t.id));
          totalPages = res.meta.totalPages;
          page += 1;
        } while (page <= totalPages);
        if (seqRef.current === seq) setTaskIds(ids);
      } catch {
        // 取得失敗は直前の集合を据え置く（フィルタが一時的に全消し表示へ暴発しない）。
        // 次の選択変更で再取得される。
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fromKey, toKey]);

  return active ? taskIds : null;
}
