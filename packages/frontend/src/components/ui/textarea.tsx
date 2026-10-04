'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm placeholder:text-[var(--sp-text-warm-mute)] focus-visible:outline-none focus-visible:border-[var(--sp-focus-border)] disabled:cursor-not-allowed disabled:bg-[var(--sp-disabled-bg)] disabled:text-[var(--sp-text-warm-mute)]',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
