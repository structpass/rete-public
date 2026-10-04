'use client';

import { Check, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDropdownPopover } from '@/hooks/use-dropdown-popover';
import { TagIcon } from './tag-icon';

/** タグ絞り込みドロップダウンが受け取るタグ最小形（TagDto / AnnouncementTagDto 共通形）。 */
interface TagItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/**
 * タグ絞り込みドロップダウン（rete-files-0013・rete-home-0043 共有化）。
 * 「タグ」ボタン（アイコン＋"タグ"）をクリックするとマスタ登録タグをリスト表示し、明細クリックで
 * フィルタを増減する（複数選択 = OR 条件）。選択中は is-on＝teal 文字＋右上赤丸ドットで示す
 * （mdl-0033: 件数バッジ方式は廃止し、選択後表現を desk-filter-icon.is-active と同形へ統一）。
 * 状態（active 集合・onToggle/onClear）は親が持つ tagFilter を共有する。
 * タグ未登録時はボタン自体を出さない（場所を取らない）。
 * File タグと AnnouncementTag の両方で使う共有コンポーネント。
 */
export function TagFilterDropdown({
  tags,
  active,
  loading,
  onToggle,
  onClear,
}: {
  tags: TagItem[];
  active: Set<string>;
  loading: boolean;
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  // メニュー外クリック / Escape で閉じる（オーバーレイではなく軽量ポップオーバーのため自前で制御）。
  // 開閉ロジックは SelectDropdown と共有フックへ抽出（hom-0099・§3）。
  const { open, setOpen, ref } = useDropdownPopover();

  // 読み込み中・タグ 0 件はボタンを出さない（高さ/場所を取らない）。
  if (loading || tags.length === 0) return null;
  const count = active.size;

  return (
    <div className="tag-filter-dd" ref={ref}>
      <button
        type="button"
        className={cn('tag-filter-dd-btn', count > 0 && 'is-on')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        <span>タグ</span>
      </button>
      {open && (
        <div className="tag-filter-dd-menu" role="menu" aria-label="タグで絞り込み">
          {tags.map((t) => {
            const on = active.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                className={cn('tag-filter-dd-item', on && 'is-on')}
                onClick={() => onToggle(t.id)}
              >
                <TagIcon name={t.icon} size={14} color={t.color} />
                <span className="tag-filter-dd-item-name">{t.name}</span>
                <span className={cn('tag-filter-dd-check', on && 'is-on')}>
                  {on && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
          {count > 0 && (
            <button type="button" className="tag-filter-dd-clear" onClick={onClear}>
              絞り込みをクリア
            </button>
          )}
        </div>
      )}
    </div>
  );
}
