'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** probe のタイムアウト（ms）。落ちている時は connection refused で即 reject されるため、これは
 *  「上がっているが応答が遅い / 経路上で drop された」ケースの上限。体感を損ねない短めに取る。 */
const PROBE_TIMEOUT_MS = 2500;

/**
 * reference（システムタブの遷移先オリジン）が実際に到達可能かをクライアント側で確認する（rete-files-0037 / common-0018）。
 *
 * env の available（OIDC 連携完成フラグ）が立っていても、reference dev サーバー（front 3000）が落ちていれば
 * クリックは `ERR_CONNECTION_REFUSED` に落ち、ユーザーには「reference が起動しない」という地雷になる。
 * これを防ぐため、シェル mount 時とウィンドウ復帰（focus）時に reference オリジンへ軽量 probe を投げ、
 * 到達不能なら呼び出し側がタブを非活性（灰色）にできるよう boolean を返す。
 *
 * 設計上の選択（common-0018 案A/B/C より）:
 * - backend の menu 描画（getMenu）には probe を載せない。毎回の menu 取得に cross-origin 往復・遅延・
 *   タイムアウト処理を負わせる結合（案A）を避け、**クライアント側で best-effort 確認**する。
 * - rete 機能は本 probe 失敗で一切止めない（reference 連携は「止めない側」）。あくまで空クリック防止の UX ガード。
 * - cross-origin のため `mode: 'no-cors'`。レスポンス内容は読めない（opaque）が、到達可否（fetch が resolve するか
 *   接続拒否で reject するか）の判定には十分。reference 側に CORS 設定を要求しない。
 *
 * 戻り値: `true`=到達可能 / 未確認（楽観的に有効・グレー点滅回避）、`false`=到達不能が確定。
 */
export function useReferenceReachable(url: string | null, enabled: boolean): boolean {
  // 確認前は楽観的に true（available 側のゲートに委ね、確認できるまでグレーにしない）。
  const [reachable, setReachable] = useState(true);

  // rete-common-0023: 「有効→無効」のチラつき防止。一度 NG（到達不能 false）が確定したら、以降は成功 probe が
  // 来ても true に戻さず disabled をラッチする。都度判定（mount / focus 再 probe）は続けるが片方向のみ。
  // 開発統括要件: ログイン時 NG → 以降ずっと非活性 / ログイン時 OK → 都度判定し途中 NG で以降ずっと非活性。
  // ラッチは shell mount（= ログイン）単位で、再ログイン（AppShell 再マウント）で初期化される。
  const latchedOffRef = useRef(false);
  const setReachableLatched = useCallback((next: boolean) => {
    if (latchedOffRef.current) return; // 既に NG 確定 → 二度と true へ戻さない
    if (next === false) latchedOffRef.current = true;
    setReachable(next);
  }, []);

  const probe = useCallback(
    async (signal: AbortSignal) => {
      if (!enabled || !url) {
        // env 未連携 or URL 無し。タブは available=false で既に灰色なので probe しない（楽観 true 維持）。
        setReachableLatched(true);
        return;
      }
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
        if (!signal.aborted) setReachableLatched(true);
      } catch {
        // 接続拒否・タイムアウト = 到達不能。アンマウント等による意図的 abort は無視（最後の結果を保持）。
        if (!signal.aborted) setReachableLatched(false);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
    },
    [url, enabled, setReachableLatched],
  );

  useEffect(() => {
    if (!enabled || !url) {
      setReachableLatched(true);
      return;
    }
    const ac = new AbortController();
    void probe(ac.signal);
    // ウィンドウ復帰時に再確認（rete を開いたまま後から reference を起動したケースを拾う）。
    const onFocus = () => void probe(ac.signal);
    window.addEventListener('focus', onFocus);
    return () => {
      ac.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [url, enabled, probe, setReachableLatched]);

  return reachable;
}
