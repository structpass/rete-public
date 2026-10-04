'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { DESK_PANE_DEFAULT_RATIO, DESK_PANE_RATIO_MIN, DESK_PANE_RATIO_MAX } from '@rete/shared';
import { fetchDeskPreference, saveDeskPreference } from '../lib/api';

// 値域・既定値は @rete/shared の SSOT（backend DTO の @Min/@Max と同一）。テスト等の利便で再公開する。
export { DESK_PANE_DEFAULT_RATIO, DESK_PANE_RATIO_MIN, DESK_PANE_RATIO_MAX };

function clampRatio(value: number): number {
  return Math.min(DESK_PANE_RATIO_MAX, Math.max(DESK_PANE_RATIO_MIN, value));
}

export interface UseDeskPaneRatioResult {
  /** 左ペイン比率（0.25〜0.75）。 */
  ratio: number;
  /** ドラッグ中か（divider の is-dragging クラスに使う）。 */
  dragging: boolean;
  /** `.desk-shell` に張る ref（ドラッグ座標 → 比率の換算基準）。 */
  shellRef: React.RefObject<HTMLDivElement | null>;
  /** `.desk-shell` の inline grid-template-columns（divider 6px は CSS 既定と同じ）。 */
  gridTemplateColumns: string;
  /** divider の onPointerDown ハンドラ。 */
  onDividerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Desk 左右ペイン幅のドラッグ変更 + 個人設定への永続化（rete-desk-0142）。
 *
 * - 初期表示: 保存済み設定を best-effort で取得（未保存・失敗時は既定 0.45 のまま静かに描画）
 * - ドラッグ中: window の pointermove で比率を更新（divider 外へポインタが出ても追従）
 * - ドラッグ終了: 動いた時のみ PUT で保存（失敗は toast 通知のみ・表示比率は維持）
 */
export function useDeskPaneRatio(): UseDeskPaneRatioResult {
  const [ratio, setRatio] = useState(DESK_PANE_DEFAULT_RATIO);
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  // pointerup（イベントリスナ内）から最新比率を参照するための ref。state と常に同期させる。
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;
  // クリックだけ（移動なし）で無駄な PUT を打たないためのフラグ。
  const movedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 初期ロードは best-effort：失敗しても既定比率で使えるため通知しない。
    fetchDeskPreference()
      .then((pref) => {
        if (!cancelled && pref != null) setRatio(clampRatio(pref.leftPaneRatio));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, []);

  const onDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // テキスト選択・ネイティブドラッグの開始を抑止する。
    e.preventDefault();
    setDragging(true);
    movedRef.current = false;
    // 子要素（カード・入力欄）上を通過してもカーソルが text/pointer にちらつかないよう body で固定する。
    document.body.style.cursor = 'col-resize';

    const handleMove = (ev: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      if (rect.width <= 0) return;
      movedRef.current = true;
      setRatio(clampRatio((ev.clientX - rect.left) / rect.width));
    };
    const handleUp = () => {
      cleanupRef.current?.();
      setDragging(false);
      if (!movedRef.current) return;
      // 永続化は best-effort：失敗しても表示比率は維持し、通知だけ出す。
      saveDeskPreference(ratioRef.current).catch(() => {
        toast.error('ペイン幅の保存に失敗しました。');
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.body.style.cursor = '';
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    // OS 側のポインタ強制終了（タッチ割り込み等）でもリスナ残留しないよう pointerup と同経路で畳む。
    window.addEventListener('pointercancel', handleUp);
  }, []);

  // divider は CSS 既定（grid 2 列目 6px）と同じ幅を保ち、左右だけ fr で配分する。
  const gridTemplateColumns = `${ratio}fr 6px ${1 - ratio}fr`;

  return { ratio, dragging, shellRef, gridTemplateColumns, onDividerPointerDown };
}
