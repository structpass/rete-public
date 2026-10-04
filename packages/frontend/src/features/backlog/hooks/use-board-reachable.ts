'use client';

import { useEffect, useState } from 'react';

/** Board v2 の疎通 probe 先。別オリジンでも到達可否だけを見るため `mode: 'no-cors'` で叩く。 */
export const BOARD_HEALTH_PATH = '/api/v2/healthz';
/** 疎通確認のポーリング間隔（ms）。iframe 内の操作で状態は変わるが、疎通自体は軽く見続ける。 */
export const BOARD_HEALTH_POLL_MS = 30_000;
/** probe のタイムアウト（ms）。停止時は connection refused で即 reject されるため、これは
 *  「上がっているが応答が遅い / 経路上で drop された」ケースの上限。体感を損ねない短めに取る。 */
const PROBE_TIMEOUT_MS = 2500;

/**
 * バックログタブが埋め込む Instruction Board v2（別プロセス・別オリジン）の疎通を判定する。
 *
 * v2 の画面（`/v2.html`）は自前のナビと一覧を持つため、rete 側はナビ定義を持たない
 * （旧 v1 の `GET /api/nav`・7 バケット・並列セッション一覧は廃止）。
 * この hook の目的は「iframe に生のブラウザ接続拒否ページが出ている時に rete 側で案内を重ねる」
 * ことだけ（brd-0180 の意図を v2 の疎通判定で維持する）。
 *
 * cross-origin のため `mode: 'no-cors'`。レスポンス内容は読めない（opaque）が、到達可否
 * （fetch が resolve するか接続拒否で reject するか）の判定には十分で、Board 側に CORS 設定を
 * 要求しない（システムタブの reference probe と同じ方針・common-0018）。
 *
 * 戻り値: `true`=到達可能 / 未確認（楽観的・初回描画のグレー点滅を避ける）、`false`=到達不能が確定。
 */
export function useBoardReachable(boardUrl: string): boolean {
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    // 本番未配線（boardUrl 空・cmn-0403）: 相対 URL で rete 自身を叩かないよう fetch せず不通固定にする。
    if (!boardUrl) {
      setReachable(false);
      return;
    }
    let cancelled = false;
    const probe = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        await fetch(`${boardUrl}${BOARD_HEALTH_PATH}`, {
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!cancelled) setReachable(true);
      } catch {
        if (!cancelled) setReachable(false);
      } finally {
        clearTimeout(timer);
      }
    };
    void probe();
    const interval = setInterval(() => void probe(), BOARD_HEALTH_POLL_MS);
    // rete を開いたまま後から Board を起動したケースを拾う（reference probe と同じ）。
    const onFocus = () => void probe();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [boardUrl]);

  return reachable;
}
