'use client';

import { useId } from 'react';
import { Check, RotateCcw, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilterPopover } from '@/components/filters/toggle-filter';

/**
 * 検索フィルタ帯の共通コンポーネント（mdl-0026 / 正本=モデルタブ comp-filter-bar）。
 *
 * Desk 統合検索フィルタバー（.desk-filter-bar.is-static）の意匠を全画面で共有する:
 * - 帯 = 透明地・枠なしの flex 横一列（sp-card の箱で囲わない）
 * - 検索窓 = .desk-filter-keyword（Search アイコン左・14rem・0.75rem）
 * - 絞り込み = FilterChipSelect（icon+label チップ → .desk-filter-menu listbox。native <select> 直置き禁止）
 * - クリア = FilterClear（RotateCcw+「クリア」を帯に常設）
 *
 * Desk 本体（desk-filter-toolbar.tsx）はチャット/タスク固有の複合フィルタのため独自実装のまま。
 * ホーム（dashboard-view.tsx）が先行した「Desk クラス流用」方式を共通コンポーネントとして構造化した。
 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="desk-filter-bar is-static sp-filter-bar">{children}</div>;
}

/**
 * 左に虫眼鏡を添えた検索入力（Desk .desk-filter-keyword 意匠）。
 *
 * mdl-0033: 「値あり」状態の表現も Desk 形へ統一＝type=search（入力中はブラウザ標準の×）+
 * Escape でクリア（IME 変換確定の Esc は誤クリアしない）。値ありの Esc は stopPropagation で
 * 親のオーバーレイ「Esc で閉じる」へ伝搬させない（値が空なら素通しして閉じる挙動を保つ）。
 */
export function FilterSearchInput({
  placeholder,
  value,
  onChange,
  ariaLabel,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="desk-filter-keyword">
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.nativeEvent.isComposing && value) {
            onChange?.('');
            e.stopPropagation();
          }
        }}
      />
    </div>
  );
}

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * 単一選択の絞り込みチップ（Desk .desk-filter-icon + .desk-filter-menu 意匠の single-select 版）。
 *
 * - 既定値（defaultValue・省略時は先頭 option）では chip は非アクティブ
 * - 既定値以外を選ぶと is-active（teal 文字 + 右上に ink の赤丸ドット）になる。ラベルは固定表示＝
 *   「ラベル: 選択値」形式は使わない（複数選択可能な項目に対応できないため不採用・mdl-0033 開発統括決定）
 * - option クリックで確定と同時に閉じる（Desk の複数選択と違い開いたままにしない）
 * - マウス枠外で閉じる挙動は Desk と共有（useFilterPopover + onMouseLeave）
 */
export function FilterChipSelect<T extends string>({
  icon: Icon,
  label,
  options,
  value,
  defaultValue,
  onChange,
  ariaLabel,
}: {
  icon: LucideIcon;
  label: string;
  options: FilterChipOption<T>[];
  value: T;
  defaultValue?: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  const { open, setOpen, ref } = useFilterPopover();
  const listboxId = useId();
  const baseValue = defaultValue ?? options[0]?.value;
  const isActive = value !== baseValue;
  const select = (v: T) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div
      className={cn('desk-filter-icon', isActive && 'is-active')}
      ref={ref}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="desk-filter-icon-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
        aria-label={ariaLabel ?? label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon className="desk-filter-icon-svg h-4 w-4" aria-hidden="true" />
        <span className="desk-filter-icon-label">{label}</span>
      </button>
      <div className="desk-filter-menu" hidden={!open}>
        <ul id={listboxId} className="desk-filter-menu-list" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const checked = opt.value === value;
            return (
              <li
                key={opt.value}
                className={cn('desk-filter-menu-item', checked && 'is-selected')}
                role="option"
                aria-selected={checked}
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  select(opt.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    select(opt.value);
                  }
                }}
              >
                <Check className="desk-filter-menu-check h-3.5 w-3.5" aria-hidden="true" />
                <span>{opt.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** フィルタ全解除ボタン（Desk .desk-filter-clear 意匠・RotateCcw+「クリア」を帯に常設）。 */
export function FilterClear({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="desk-filter-clear"
      onClick={onClick}
      aria-label="フィルタをクリア"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      <span>クリア</span>
    </button>
  );
}
