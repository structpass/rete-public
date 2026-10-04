'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // mdl-0025: 標準密度の入力欄高さは --sp-input-h（40px）参照。h-10 直書きだとトークンと実装が結び付かずドリフトする。
          // mdl-0027: 単一行入力は縦 padding 無し（height 固定 + 中央寄せ）。左右は標準 12px（px-3）。
          'flex h-[var(--sp-input-h)] w-full rounded-md border border-input bg-input-bg px-3 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--sp-text-warm-mute)] focus-visible:outline-none focus-visible:border-[var(--sp-focus-border)] disabled:cursor-not-allowed disabled:bg-[var(--sp-disabled-bg)] disabled:text-[var(--sp-text-warm-mute)]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
