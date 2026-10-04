/**
 * Desk 明細（チャット明細カード / タスク明細行）の状況列アイコン群。
 * モック（desk/index.html）の inline SVG を移植した見た目専用コンポーネント。色・サイズは
 * 各 `.desk-thread-*` / `.desk-chat-archive-mark` クラスの CSS（globals.css）が担う。
 * 線幅（strokeWidth）は本コンポーネント側で一元管理し、CSS で二重上書きしない（mdl-0019）。
 * 細線（1.5 単一値・mdl-0024）は高密度画面向けの意図的デザイン（lucide 既定2の対象外となる自作 SVG 特例）。
 *
 * チャット明細・タスク明細の両方で使うため共有化（architecture-invariants §3 コピペ禁止）。
 */

/** 顛末アイコン（モック TENMATSU_ICON_SVG / 書類アイコン・teal は CSS が着色）。 */
export function TenmatsuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="15" y1="13" x2="9" y2="13" />
      <line x1="15" y1="17" x2="9" y2="17" />
    </svg>
  );
}

/** アーカイブアイコン（モック ARCHIVE_SVG / 箱アイコン・灰色は CSS が着色）。 */
export function ArchiveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

/** クローズアイコン（モック status-close SVG / チェック付き丸・灰色は CSS が着色）。
 *  線幅は同一セルに並ぶ Tenmatsu / Archive と同じ 1.5 に統一する（mdl-0024・状況列内で太さを揃える）。 */
export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5L15.5 10" />
    </svg>
  );
}

/** メンションアイコン（モック .desk-meta-icon = メッセージ吹き出し / 赤塗りは CSS の .is-mention が担う）。
 *  塗りつぶし表現のため線は描かない（strokeWidth 0・旧 CSS 上書きから移設）。 */
export function MentionIcon() {
  return (
    <svg
      className="desk-meta-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={0}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
