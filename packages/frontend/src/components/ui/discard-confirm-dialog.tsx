'use client';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DiscardConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 確認本文。既定は編集破棄。テーマ入力のクリアなど文言が異なる経路で差し替える（rete-desk-0102）。 */
  message?: string;
}

/**
 * 破棄確認の Rete デザインダイアログ（rete-desk-0102 / ブラウザ標準 window.confirm の置換）。
 * desk 各所の「編集中の内容を破棄しますか？」をこの共有ダイアログへ統一する。open=false の間は閉じている。
 * 確定（OK）で onConfirm、キャンセル / 背景クリック / ESC で onCancel。
 *
 * 文言は見出し + 説明の二段をやめ、本文 1 行のみ（rete-desk-0127/0128: 旧「変更を破棄しますか？」h2 と
 * 説明 p が同義重複していたため単一化）。ボタンは キャンセル / OK（rete-desk-0125/0126）。
 * 初期フォーカスはキャンセル側（data-autofocus / rete-desk-0133）。
 */
export function DiscardConfirmDialog({
  open,
  onConfirm,
  onCancel,
  message = '編集中の内容を破棄しますか？保存していない変更は失われます。',
}: DiscardConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={message}
      destructive
    />
  );
}
