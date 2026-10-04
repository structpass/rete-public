'use client';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  label?: React.ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  /** mdl-0025: compact 密度画面（設定・ファイル・Desk 等）ではラベル間隔 4px・ラベル 0.75rem/600 を適用する。
      標準密度（ログイン等の単独フォーム）はデフォルトのまま。密度は2値のみ（画面ごとの中間値禁止）。 */
  compact?: boolean;
  children: React.ReactNode;
}

export function FormField({
  label,
  error,
  required,
  htmlFor,
  className,
  compact,
  children,
}: FormFieldProps) {
  return (
    <div
      className={cn(
        'w-full',
        compact
          ? 'space-y-[var(--sp-form-label-gap-compact)]'
          : 'space-y-[var(--sp-form-label-gap)]',
        className,
      )}
    >
      {label && (
        <Label htmlFor={htmlFor} className={compact ? 'text-xs font-semibold' : undefined}>
          {label}
          {required && (
            <span className="ml-2 text-xs text-[var(--sp-accent-red)]">
              <span className="align-middle text-base">*</span>
              必須
            </span>
          )}
        </Label>
      )}
      {children}
      {error && <p className="text-sm text-[var(--sp-accent-red)]">{error}</p>}
    </div>
  );
}
