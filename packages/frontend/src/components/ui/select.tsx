'use client';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  portalRef: React.RefObject<HTMLDivElement | null>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error('Select components must be used within Select');
  return ctx;
}

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function Select({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  disabled,
  children,
}: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const [labels, setLabels] = React.useState<Record<string, string>>({});

  const registerLabel = React.useCallback((itemValue: string, label: string) => {
    setLabels((prev) => {
      if (prev[itemValue] === label) return prev;
      return { ...prev, [itemValue]: label };
    });
  }, []);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
      setOpen(false);
    },
    [controlledValue, onValueChange],
  );

  React.useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    // cmn-0181: mousedown の RAF 遅延登録でリスナー残留は起きない（cleanup の cancelAnimationFrame と
    // removeEventListener が同一 effect クロージャの timer / handler を掴むため、未発火なら登録自体が起きず
    // 発火済みなら解除が当たる）。トリガは onClick のため即時登録でも自己クローズしないが、set-0142 で
    // 複数画面の共用部品となった今、便益なき挙動変更はしない。
    const timer = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleMouseDown);
    });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: handleValueChange,
        open,
        setOpen,
        disabled,
        triggerRef,
        portalRef,
      }}
    >
      <SelectLabelContext.Provider value={labels}>
        <SelectRegisterContext.Provider value={registerLabel}>
          <div ref={containerRef} className="relative">
            {children}
          </div>
        </SelectRegisterContext.Provider>
      </SelectLabelContext.Provider>
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen, disabled, triggerRef } = useSelectContext();

    const mergedRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      },
      [ref, triggerRef],
    );

    return (
      <button
        ref={mergedRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          // mdl-0025: 標準密度の入力欄高さは --sp-input-h（40px）参照（Input と同じくトークンへ結線）。
          // mdl-0027: 単一行トリガーは縦 padding 無し（height 固定 + items-center）。左右は標準 12px（px-3）。
          'flex h-[var(--sp-input-h)] w-full items-center justify-between rounded-md border border-input bg-input-bg px-3 text-sm focus:outline-none focus:border-[var(--sp-focus-border)] disabled:cursor-not-allowed disabled:bg-[var(--sp-disabled-bg)] disabled:text-[var(--sp-text-warm-mute)]',
          className,
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        {...props}
      >
        {children}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--sp-text-warm-mute)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

function SelectValue({ placeholder, className }: SelectValueProps) {
  const { value } = useSelectContext();
  return <SelectLabelLookup value={value} placeholder={placeholder} className={className} />;
}

function SelectLabelLookup({
  value,
  placeholder,
  className,
}: {
  value: string;
  placeholder?: string;
  className?: string;
}) {
  const labels = React.useContext(SelectLabelContext);

  if (!value) {
    return (
      <span className={cn('block truncate text-[var(--sp-text-warm-mute)]', className)}>
        {placeholder}
      </span>
    );
  }

  const displayLabel = labels?.[value] ?? value;
  return <span className={cn('block truncate', className)}>{displayLabel}</span>;
}

const SelectLabelContext = React.createContext<Record<string, string> | null>(null);

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

function SelectContent({ className, children, ...props }: SelectContentProps) {
  const { open, triggerRef, portalRef } = useSelectContext();
  const [pos, setPos] = React.useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 0, maxHeight: 240 });

  React.useEffect(() => {
    if (!open || !triggerRef.current) return;

    const update = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const margin = 8;
      const desired = 240;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const placeAbove = spaceBelow < desired && spaceAbove > spaceBelow;
      const maxHeight = Math.max(80, Math.min(desired, placeAbove ? spaceAbove : spaceBelow));
      if (placeAbove) {
        setPos({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          width: rect.width,
          maxHeight,
        });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight });
      }
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, triggerRef]);

  // 閉じている間も label 登録のため非表示で描画する。
  if (!open) {
    return <div style={{ display: 'none' }}>{children}</div>;
  }

  // z-[10070]: コードベース既知の最大 z（reaction-bar.tsx の絵文字ピッカー inline zIndex:10060、
  // OverlayDialog/AlertDialog=10050、desk オーバーレイ=10000〜10010）をすべて超える値（set-0142）。
  // OverlayDialog 内フォームでも dropdown が背面に潜らない。旧 10001 はタスク詳細オーバーレイ
  // （10000）対策（dsk-0344）だったが、OverlayDialog(10050) 内で使うと裏に潜る矛盾があった。
  return ReactDOM.createPortal(
    <div
      ref={portalRef}
      className={cn(
        'fixed z-[10070] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg',
        className,
      )}
      style={{
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }}
      role="listbox"
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}

const SelectRegisterContext = React.createContext<((value: string, label: string) => void) | null>(
  null,
);

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function SelectItem({
  className,
  value: itemValue,
  children,
  disabled,
  ...props
}: SelectItemProps) {
  const { value, onValueChange } = useSelectContext();
  const registerLabel = React.useContext(SelectRegisterContext);
  const isSelected = value === itemValue;
  const childText = typeof children === 'string' ? children : '';

  React.useEffect(() => {
    if (registerLabel && childText) {
      registerLabel(itemValue, childText);
    }
  }, [registerLabel, itemValue, childText]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-[0.1875rem] py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-[var(--sp-select-hover)]',
        isSelected && 'bg-[var(--sp-select-soft)]',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onValueChange(itemValue);
      }}
      {...props}
    >
      {isSelected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-4 w-4" />
        </span>
      )}
      {children}
    </div>
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
