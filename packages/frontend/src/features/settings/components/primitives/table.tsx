import { Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';

export { Pagination } from '@/components/shared/pagination';

/**
 * sp-card + 横スクロール枠でテーブルを包むパネル。ページ内タブのパネルとしても使う。
 * active=false の時は描画自体を抑止する（タブ非選択パネル）。
 *
 * hoverBand（既定 off・set-0140）: 帯スライド hover を有効化する opt-in。呼び出し側は
 * children の table に `sp-table--hoverband` クラスと、行に `sp-row-pillable` クラスを
 * 付与すること（本コンポーネントは children を透過するだけで table 構造を持たない）。
 * カード単位で hook を持つため、同一画面に複数 TableCard を置いても帯 state は競合しない。
 */
export function TableCard({
  children,
  active = true,
  hoverBand = false,
  borderless = false,
}: {
  children: ReactNode;
  active?: boolean;
  hoverBand?: boolean;
  /** カード境界（.sp-card の 1px 外枠・角丸）を消す opt-in。テーブル自身が sp-table--framed 等の
   *  外枠を持つ時に二重枠を避けるための修飾（set-0165: 組織管理 3 ペイン）。 */
  borderless?: boolean;
}) {
  // set-0140 code-review HIGH是正: 素の 'tbody tr' は読込中/空状態の非対象行まで拾う
  // (sp-row-pillable 無しの行は z-index 昇格が無く帯に埋もれる)。file-list.tsx / dashboard-view.tsx
  // と同じくクラス限定セレクタにする。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } = useRowHoverBand<HTMLDivElement>(
    'tbody tr.sp-row-pillable',
  );
  if (!active) return null;
  return (
    <section
      className="sp-card"
      style={{
        overflow: 'hidden',
        border: borderless ? 'none' : undefined,
        borderRadius: borderless ? 0 : undefined,
      }}
      role="tabpanel"
    >
      <div
        ref={hoverBand ? listRef : undefined}
        style={{ overflowX: 'auto', position: hoverBand ? 'relative' : undefined }}
        onMouseOver={hoverBand ? onMouseOver : undefined}
        onMouseLeave={hoverBand ? onMouseLeave : undefined}
      >
        {children}
        {hoverBand && bandStyle ? (
          <div aria-hidden className="sp-row-hoverband" style={bandStyle} />
        ) : null}
      </div>
    </section>
  );
}

/** テーブル行末の編集アイコンボタン。 */
export function RowEditButton({
  onClick,
  label = '編集',
  disabled = false,
}: {
  onClick?: () => void;
  label?: string;
  /** 保存中など、別行を開かせたくない時に押下抑止する（既定 false = 従来挙動）。 */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sp-row-icon-btn"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

/** テーブル行末の削除アイコンボタン（危険操作＝is-danger トーン・set-0111）。 */
export function RowDeleteButton({
  onClick,
  label = '削除',
  disabled = false,
}: {
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sp-row-icon-btn is-danger"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
