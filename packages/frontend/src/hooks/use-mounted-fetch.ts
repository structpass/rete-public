'use client';

import { useEffect, type DependencyList } from 'react';

/**
 * 初回ロード等の「unmount 後の setState 抑止」定型（let alive=true + async IIFE + cleanup）を
 * 抽出した hook（set-0047・§6・settings 画面群 7ファイル10箇所超の逐語偏在を解消）。
 *
 * fetcher 本体（try/catch/finally・Promise.allSettled 等の分岐）はそのまま各画面に残し、
 * 「まだ生きているか」の判定だけを alive() コールバックとして受け取れるようにする
 * （画面ごとに setState の組み合わせ・エラーハンドリングが異なり単純な fetch+setState の
 * ラップでは吸収しきれないため、ガードの共通化に留める）。
 */
export function useMountedFetch(
  fetcher: (alive: () => boolean) => void | Promise<void>,
  deps: DependencyList,
): void {
  useEffect(() => {
    let alive = true;
    void fetcher(() => alive);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
