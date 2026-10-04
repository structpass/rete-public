import type { ReactNode } from 'react';

/**
 * 画面タイトル（機能名見出し）の共通部品（mdl-0028・正本=モデルタブ「画面タイトル」テーマ）。
 * メニュー（タブ / サイドバー項目）でクリックした機能名をコンテンツ領域の左上に表示する。
 * 意匠は reference PageHeader（text-xl / semibold / tracking-tight / --sp-text-warm / mb-3 /
 * 区切り線なし）と同一。rete はサイドバーヘッダーが h1 を使うためコンテンツ側タイトルは h2。
 */
export function PageTitle({
  title,
  after,
  description,
  className,
}: {
  title: string;
  /** タイトル右隣に添える小要素（ステータスバッジ等） */
  after?: ReactNode;
  /** タイトル右の補足説明（同一行・text-xs・mute 色） */
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center gap-2${className ? ` ${className}` : ''}`}>
      <h2 className="text-xl font-semibold tracking-tight text-[var(--sp-text-warm)]">{title}</h2>
      {after}
      {description && (
        <span className="text-xs text-[var(--sp-text-warm-mute)]">{description}</span>
      )}
    </div>
  );
}
