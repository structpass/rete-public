'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * 破棄確認（Rete デザインダイアログ）の状態と遅延アクションを共通化する（rete-desk-0102）。
 *
 * ブラウザ標準の `window.confirm`（同期ブロッキング）を Rete UI ダイアログ（非同期）へ置き換えるための
 * 中核 hook。同期 boolean を返す guard とは異なり、確認を「遅延アクション」として保持する:
 *
 * - `request(isDirty, proceed)`: 未編集（!isDirty）なら proceed を即実行。編集中なら proceed を保留して
 *   ダイアログを開く（`open=true`）。呼び出し側の遷移はこの時点では実行されない。
 * - `onConfirm`: 保留アクションを実行してダイアログを閉じる（＝破棄して続行）。
 * - `onCancel`: 保留アクションを捨ててダイアログを閉じる（＝編集に留まる）。
 *
 * proceed は ref 保持し、setState updater 内では呼ばない（StrictMode の二重実行で遷移が
 * 2 回走るのを防ぐ）。A1 状態機械（use-desk-view-state）は同期 guard を消費し続けるため、
 * 呼び出し側は proceed の中で dirty フラグを落としてから遷移を呼ぶ（状態機械は不触のまま）。
 */
export function useDiscardConfirm() {
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const request = useCallback((isDirty: boolean, proceed: () => void) => {
    if (!isDirty) {
      proceed();
      return;
    }
    pendingRef.current = proceed;
    setOpen(true);
  }, []);

  const onConfirm = useCallback(() => {
    const proceed = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    proceed?.();
  }, []);

  const onCancel = useCallback(() => {
    pendingRef.current = null;
    setOpen(false);
  }, []);

  return { open, request, onConfirm, onCancel };
}
