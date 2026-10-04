import type { MouseEvent, ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';

/**
 * フィルタ・アクション帯の残存部品（set-0111 で FilterBar 本体は廃止）。
 *
 * 帯コンポーネントの正本は components/shared/filter-bar.tsx（Desk 意匠の
 * FilterBar / FilterSearchInput / FilterChipSelect / FilterClear）。本ファイルが外へ出すのは
 * ListActionRow / ActionButton の 2 つ（ActionGroup は set-0150 で内部関数へ降格。FilterSelect は
 * set-0142 で共通 Select（components/ui/select.tsx）へ完全移行し削除）。
 */

/**
 * 右寄せのアクションボタン群コンテナ。
 *
 * set-0150 で内部関数へ降格した（barrel の再 export を撤去）。設定タブ 7 画面のアクションは
 * すべて ListActionRow 経由で並ぶため外部消費者はゼロで、公開したままだと「絞り込み帯の中へ
 * 直接置いてよい部品」と誤読される余地が残る。帯の中へ戻す変更は set-0151/0152 の移行を巻き戻す。
 * レイアウト値（右寄せ・間隔）は `.sp-list-action-row-actions`（globals.css）が持つ（set-0155）。
 */
function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="sp-list-action-row-actions">{children}</div>;
}

/**
 * 一覧に対するアクションを、絞り込み帯の外・表の直上に右寄せで並べる独立行（set-0151）。
 *
 * 参照実装（struct-pass-reference）の ListPageActions と同じ位置に立つ部品だが、あちらは
 * onExport / onNew を固定 props で受ける別 API なので同名にしない。こちらは children だけを
 * 受け、呼び出し側が ActionButton を直接並べる（新規登録も補助アクションも同じ扱い）。
 * 右寄せは内部の ActionGroup が担うため、呼び出し側で margin-left を書かない。
 *
 * 条件付きで出るアクション（例: メンバーシップ管理の「メンバーを追加」）は、**この行ごと**
 * 条件の中へ入れる＝空の行だけが残らないようにする。
 *
 * 見た目（flex / 中央揃え / margin-bottom 0.25rem）は `.sp-list-action-row`（globals.css・対の
 * `.sp-filter-bar` の隣）が持ち、ここには書かない（set-0150）。同クラス名は設定タブ 7 画面の
 * テストの掛かり先でもあるので、CSS 側もろとも未使用と見なして消さないこと。
 *
 * 内側の ActionGroup も `.sp-list-action-row-actions`（globals.css）へ移設済み（set-0155）。
 * set-0150 時点は「帯の中でも使える汎用コンテナ」を理由に対象外としたが、消費者が本行の
 * 1 箇所だけになり理由が失効したため、外殻と同じ層へ寄せた（見た目は等価）。
 */
export function ListActionRow({ children }: { children: ReactNode }) {
  return (
    <div className="sp-list-action-row">
      <ActionGroup>{children}</ActionGroup>
    </div>
  );
}

/**
 * sp-action variant のボタン（Excel 出力 / 招待 / 行内アクション など）。
 * loading 中はスピナーを前置し押下を抑止する（FormButton と同じ作法・set-0117 項目2）。
 * onClick はイベントを受け取れる（行内利用で e.stopPropagation() が要るため・set-0123。
 * 引数を使わない既存呼び出しはそのまま互換）。危険操作は danger で is-danger（赤系）にする。
 * iconOnly を true にすると label を描画せず正方形アイコン化する（set-0153）。
 */
export function ActionButton({
  icon,
  children,
  onClick,
  ariaLabel,
  disabled,
  loading = false,
  danger = false,
  /**
   * icon-only ボタン。true のとき children を描画せず .sp-action-btn--icon-only modifier を
   * 適用して正方形化する（label 込みの padding 0.625rem は icon 単独だと余白になるため）。
   * a11y: label テキストが消えるため ariaLabel を実質必須とする（既存呼び出しは
   * 全件 ariaLabel 設定済・型は optional のまま据え置き、set-0153）。
   */
  iconOnly = false,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  disabled?: boolean;
  /** 処理中: スピナーを表示し押下を抑止する（既定 false）。 */
  loading?: boolean;
  /** 危険操作（解除等）: is-danger クラスで赤系表示にする（既定 false）。 */
  danger?: boolean;
  /** icon-only 化。CSS modifier は globals.css の .sp-action-btn--icon-only（set-0153）。 */
  iconOnly?: boolean;
}) {
  const isDisabled = disabled || loading;
  const className = [
    'sp-action-btn',
    danger ? 'is-danger' : null,
    iconOnly ? 'sp-action-btn--icon-only' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={isDisabled}
      style={isDisabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : icon}
      {!iconOnly && children}
    </button>
  );
}
