'use client';

import { Toaster } from 'react-hot-toast';

/**
 * トーストの表示時間。
 *
 * 通常（成功・案内）は 3 秒で消す＝操作の邪魔をしない。エラーは 15 秒残す（開発統括指示・2026-09-23）。
 * 失敗の文言は理由まで含むため読み切るのに時間がかかり、3 秒では消えたあとに何が起きたか分からなくなる。
 * react-hot-toast は toastOptions の型ごと（success/error/loading/custom）に上書きできるため、
 * ここで error だけを延ばす＝成功トーストの挙動は変えない。
 */
const DEFAULT_DURATION_MS = 3000;
const ERROR_DURATION_MS = 15000;

/**
 * トーストの重なり順（v2-206・z-[10080]）。
 *
 * react-hot-toast の既定は 9999 で、Rete のオーバーレイ（OverlayDialog / AlertDialog = 10050、
 * 選択リスト = 10070）より下になる。そのためオーバーレイを開いている間に出すトーストは曇り面の
 * 裏に描かれ、DOM には在るのに画面では見えない（招待管理の CSV 取り込み失敗で実測・v2-206）。
 * 失敗理由をその場で読めるようにするため、既知の最大（10070）より上へ置く。階段の値は
 * ui/select.tsx・ui/alert-dialog.tsx のコメントが正本。新しい最前面を作る時はここも上げる。
 */
const TOASTER_Z_INDEX = 10080;

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      containerStyle={{ zIndex: TOASTER_Z_INDEX }}
      toastOptions={{
        duration: DEFAULT_DURATION_MS,
        error: { duration: ERROR_DURATION_MS },
        style: { fontSize: '14px' },
      }}
    />
  );
}
