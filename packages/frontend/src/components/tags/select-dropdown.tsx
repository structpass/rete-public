'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDropdownPopover } from '@/hooks/use-dropdown-popover';

/** 選択ドロップダウンの1項目。アイコンは呼び出し側で描画済みノードを渡す（lucide / TagIcon の型差を吸収）。 */
export interface SelectDropdownItem {
  id: string;
  name: string;
  icon?: ReactNode;
}

/**
 * 複数選択ドロップダウン（hom-0099）。全画面モーダル（TagPickerOverlay）の代替として、
 * トリガーボタンの真下に開く軽量メニューで項目を即時トグルする。確定ボタンは持たず、
 * 選択状態（selectedIds・onToggle/onClear）は親の state をそのまま操作する（DB 保存は親の submit 時のみ）。
 * 意匠は既存のタグ絞り込みドロップダウン（.tag-filter-dd-*）を再利用し、開閉ロジック
 * （外クリック / Escape）は useDropdownPopover を TagFilterDropdown と共有する（§3）。
 */
export function SelectDropdown({
  items,
  selectedIds,
  onToggle,
  onClear,
  triggerLabel,
  triggerIcon,
  menuLabel,
  triggerAriaLabel,
  clearLabel = '選択を解除',
  emptyText,
  disabled,
}: {
  items: SelectDropdownItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  /** トリガーボタンの文言（例: 編集）。menuLabel 未指定時はメニューの aria-label も兼ねる。 */
  triggerLabel: string;
  triggerIcon?: ReactNode;
  /** メニューの aria-label。ボタン文言が「編集」のような汎用語の時に用途を識別させる（hom-0100）。 */
  menuLabel?: string;
  /**
   * トリガーボタンの aria-label（hom-0100）。同一フォームに「編集」ボタンが複数並ぶ時、
   * 支援技術向けに用途を識別させる（例:「通知先を編集」= 可視文言「編集」を含めて Label in Name を満たす）。
   */
  triggerAriaLabel?: string;
  /** 下端の全解除行の文言。選択中のみ表示する。 */
  clearLabel?: string;
  /** 項目 0 件時にメニュー内へ出す案内文（未指定なら空メニュー）。 */
  emptyText?: string;
  disabled?: boolean;
}) {
  const { open, setOpen, ref } = useDropdownPopover();
  const selected = new Set(selectedIds);

  return (
    <div className="tag-filter-dd" ref={ref}>
      <Button
        type="button"
        variant="sp-action"
        size="sp-compact"
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      >
        {triggerIcon}
        {triggerLabel}
      </Button>
      {open && (
        <div className="tag-filter-dd-menu" role="menu" aria-label={menuLabel ?? triggerLabel}>
          {items.length === 0 && emptyText && (
            <span className="tag-filter-dd-item" style={{ cursor: 'default' }}>
              {emptyText}
            </span>
          )}
          {items.map((item) => {
            const on = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                className={cn('tag-filter-dd-item', on && 'is-on')}
                onClick={() => onToggle(item.id)}
              >
                {item.icon}
                <span className="tag-filter-dd-item-name">{item.name}</span>
                <span className={cn('tag-filter-dd-check', on && 'is-on')}>
                  {on && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
          {selected.size > 0 && (
            <button type="button" className="tag-filter-dd-clear" onClick={onClear}>
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
