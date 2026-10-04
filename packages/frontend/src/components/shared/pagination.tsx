import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

const NAV_BTN_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded text-[var(--sp-text-warm-mute)] transition-colors hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--sp-text-warm-mute)]';

/**
 * rete 標準ページネーション帯（mdl-0016・ホーム/struct-pass-reference と同型に統一）。
 * h-8 / 3列grid・中央に[全件数][ナビ4ボタン][ページ数]・背景色なし。
 * ナビボタンは操作ハンドラを1つでも渡した時だけ描画する（真にページングする画面のみ）。
 * 渡さない画面（全件表示の一覧）は件数表示のみの静的フッターになる。
 */
export function Pagination({
  pageLabel = '1 / 1 page',
  total,
  onFirst,
  onPrev,
  onNext,
  onLast,
  canPrev = false,
  canNext = false,
}: {
  pageLabel?: string;
  total: ReactNode;
  onFirst?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onLast?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  const hasNav = !!(onFirst || onPrev || onNext || onLast);

  return (
    <div className="sp-pagination grid h-8 shrink-0 grid-cols-3 items-center border-t border-[var(--sp-line-warm-2)] px-3 text-xs text-[var(--sp-text-warm-2)]">
      <div />
      <div className="flex items-center justify-center gap-6">
        <span className="whitespace-nowrap text-[var(--sp-text-warm-mute)]">{total}</span>
        {hasNav && (
          <div className="flex items-center gap-0.5" aria-label="ページ切り替え">
            <button
              type="button"
              onClick={onFirst}
              disabled={!onFirst || !canPrev}
              aria-label="先頭ページ"
              className={NAV_BTN_CLASS}
            >
              <ChevronFirst className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev || !canPrev}
              aria-label="前のページ"
              className={NAV_BTN_CLASS}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext || !canNext}
              aria-label="次のページ"
              className={NAV_BTN_CLASS}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onLast}
              disabled={!onLast || !canNext}
              aria-label="最終ページ"
              className={NAV_BTN_CLASS}
            >
              <ChevronLast className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {pageLabel && (
          <span className="whitespace-nowrap text-[var(--sp-text-warm-mute)]">{pageLabel}</span>
        )}
      </div>
      <div />
    </div>
  );
}
