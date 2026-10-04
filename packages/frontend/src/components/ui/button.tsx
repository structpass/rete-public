'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

// 主ボタン意匠の正本は sp-primary。default は defaultVariants 用のエイリアスとして
// 同一クラス文字列を共有する（cmn-0164 U-L2。別々に書くと片側だけ改変されて分裂する）。
const spPrimaryClasses =
  'bg-[var(--sp-accent-teal)] text-white font-medium enabled:hover:bg-[var(--sp-accent-teal-strong)] enabled:active:bg-[var(--sp-accent-teal-strong-2)]';

const buttonVariants = cva(
  // focus-visible: 細い濃色の枠線をボタンから少し浮かせて表示（rete-desk-0149）。
  // 旧 inset box-shadow（rgba 0.12）は実質不可視だったため、teal 全不透明 ring + offset で「浮いた枠」にする。
  // disabled は「禁止カーソル + 減光」で表現する（mdl-0020 ホバー正本）。pointer-events-none だと
  // カーソルが変わらず「押せそうで押せない」が起きるため、hover 系は enabled: ガードで抑止する。
  // gap-1: アイコン⇄ラベル間隔の既定 4px（mdl-0024 icon 正本。呼び出し側での個別 gap 指定を不要にする）。
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[0.1875rem] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-accent-teal)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: spPrimaryClasses,
        destructive:
          'bg-[var(--sp-accent-red)] text-white enabled:hover:bg-[var(--sp-accent-red-strong)]',
        outline:
          'border border-input bg-background enabled:hover:bg-[var(--sp-accent-soft)] enabled:hover:text-[var(--sp-accent-ink)]',
        secondary: 'bg-secondary text-secondary-foreground enabled:hover:bg-secondary/80',
        ghost: 'enabled:hover:bg-[var(--sp-accent-soft)] enabled:hover:text-[var(--sp-accent-ink)]',
        link: 'text-primary underline-offset-4 enabled:hover:underline',
        'sp-primary': spPrimaryClasses,
        // 透明系の共通寸法（globals.css の .sp-action-btn グループと同値・v2-224 / ADR 0081）。
        // font-size は size より後に連結される compoundVariants 側で当てる＝同じ size を併用する
        // 塗り系（sp-primary + sp-compact）の字面を巻き込まない（cva の出力順は base → variant → size → compound）。
        'sp-action':
          'rounded-[0.375rem] text-[var(--sp-text-warm-2)] enabled:hover:bg-[var(--sp-accent-soft)] enabled:hover:text-[var(--sp-accent-ink)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
        'icon-sm': 'h-7 w-7',
        'sp-compact': 'h-8 px-3 text-xs',
      },
    },
    compoundVariants: [
      // 透明アクションの実寸法（.sp-action-btn / 透明系共通グループと同値）。
      // compound は size の後ろへ連結されるため text-xs に勝つ（順序を入れ替えると効かなくなる）。
      { variant: 'sp-action', size: 'sp-compact', class: 'text-[0.8125rem]' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className="h-4 w-4" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
