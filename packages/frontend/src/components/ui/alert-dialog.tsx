'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext() {
  const ctx = React.useContext(AlertDialogContext);
  if (!ctx) throw new Error('AlertDialog components must be used within AlertDialog');
  return ctx;
}

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function AlertDialog({ open = false, onOpenChange, children }: AlertDialogProps) {
  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => onOpenChange?.(newOpen),
    [onOpenChange],
  );
  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange } = useAlertDialogContext();
  const [mounted, setMounted] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ESC はダイアログのキャンセル扱いでここで消費する。背後の画面（desk-shell の closeAll 等）へ
        // 伝播させると「閉じた直後に再び破棄確認が開く」二重発火になる（rete-desk-0124）。
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  // 開いた時の初期フォーカスと、←→ / Tab によるボタン間フォーカス移動（rete-desk-0133）。
  // 初期位置は data-autofocus 付きボタン（キャンセル）。Enter はフォーカス中ボタンの既定クリックに委ねる。
  // 閉じた時は開く前のフォーカス位置へ戻す（WCAG 2.4.3 / フォーカスを動かす以上、復元まで担う）。
  React.useEffect(() => {
    if (!open || !mounted) return;
    const root = contentRef.current;
    if (!root) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // まずダイアログ container 自体（tabIndex=-1）へ同期フォーカスする（rete-desk-0152）。
    // ボタンへの初期フォーカスだけだと、開いた直後は document にフォーカスが乗らず Esc（document の
    // keydown リスナ）が起動直後に効かない場合がある（フォーム要素をクリックして初めて効く差し戻し）。
    // container を先に focus して document/window にフォーカスを確実に移し、その後ボタンへ視覚フォーカスを移す。
    root.focus();
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    // 視覚上の初期位置（autofocus=キャンセル）は次フレームで当てる（二段マウントの focus 取りこぼし回避）。
    const rafId = requestAnimationFrame(() => {
      (root.querySelector<HTMLButtonElement>('button[data-autofocus]') ?? buttons[0])?.focus();
    });
    const handleKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) return;
      e.preventDefault();
      const items = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const backward = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey);
      const next = current < 0 ? 0 : (current + (backward ? items.length - 1 : 1)) % items.length;
      items[next]?.focus();
    };
    root.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(rafId);
      root.removeEventListener('keydown', handleKey);
      // 復元先が既に DOM から外れている時（オーバーレイごと閉じた等）は何もしない。
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      {/* z-[10050]: モーダルは普遍的に最前面が正。desk のチャット詳細オーバーレイは z-index 9998-10000 帯を
          使うため、その上へ確実に乗せる（rete-desk-0102: 確認ダイアログが最前面に来ない差し戻し対応）。
          背景は黒塗り透過ではなく薄いグレーの曇りガラス（--sp-overlay-scrim + blur）で目立ちすぎを抑える（rete-desk-0123 / cmn-0115）。 */}
      <div className="fixed inset-0 z-[10050] bg-[var(--sp-overlay-scrim)] backdrop-blur-sm" />
      <div
        ref={contentRef}
        className={cn(
          // ダイアログ面は純白（bg-background はわずかにグレーで沈む / rete-desk-0129）。
          'fixed left-[50%] top-[50%] z-[10050] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg sm:rounded-lg',
          className,
        )}
        role="alertdialog"
        aria-modal="true"
        // container を初期フォーカス先にするため focusable に（rete-desk-0152）。Tab 順には載せない（-1）。
        tabIndex={-1}
        {...props}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
  );
}

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-xl font-semibold', className)} {...props} />;
}

function AlertDialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-[var(--sp-text-warm-mute)]', className)} {...props} />;
}

function AlertDialogAction({ className, ...props }: ButtonProps) {
  return <Button className={cn(className)} {...props} />;
}

function AlertDialogCancel({ className, ...props }: ButtonProps) {
  const { onOpenChange } = useAlertDialogContext();
  return (
    <Button
      variant="outline"
      className={cn('mt-2 sm:mt-0', className)}
      onClick={() => onOpenChange(false)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
