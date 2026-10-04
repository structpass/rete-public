'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 対象・操作・結果を、OK／キャンセルだけでも判断できる文面で渡す。 */
  message: string;
  /** 結果を失う操作だけ true。確定ボタンを destructive 色にする。 */
  destructive: boolean;
  /** 実行中は両ボタンと Esc／背景による取消を無効化する。 */
  busy?: boolean;
}

/** Rete 全体の確認UI。操作名ではなく本文で判断し、ボタンはキャンセル／OKに固定する。 */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  message,
  destructive,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
    >
      <AlertDialogContent aria-label={message}>
        <p className="text-sm text-[var(--sp-text-warm)]">{message}</p>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-autofocus
            disabled={busy}
            className="focus:outline-none focus:ring-2 focus:ring-[var(--sp-accent-teal)] focus:ring-offset-2"
          >
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={busy}
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
