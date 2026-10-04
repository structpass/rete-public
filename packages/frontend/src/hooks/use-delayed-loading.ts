import { useEffect, useState } from 'react';

/**
 * ローディングスピナーの遅延表示 hook（dsk-0234）。
 *
 * `loading=true` が `delayMs` 継続して初めて true を返す。閾値内に `loading` が false へ戻れば
 * 一度も true にならない＝高速ロード（数十ms で解決）時のスピナーのフラッシュ（一瞬出て消える）を抑制する。
 * 真に遅い（閾値超）ロードの時だけスピナーを出すので「読み込み中」表示の役割は維持する。
 *
 * dsk-0219 で seed パターン（一覧の要約を種に即描画）でちらつきを減らしたが、種が無い経路
 * （新規作成直後・tree 未反映）では loading=true 初期描画でフラッシュが再発した。本 hook は
 * その構造的穴を「閾値前は描画しない」という方式レベルで塞ぐ恒久対処。
 * 現状の利用箇所は chat-thread（stale 保持の再取得）のみ。タスク詳細は dsk-0234 で初回スピナー非描画の別方式（loading を描画条件から外す）を採っており本 hook は使わない。
 */
export function useDelayedLoading(loading: boolean, delayMs = 200): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!loading) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return delayed;
}
