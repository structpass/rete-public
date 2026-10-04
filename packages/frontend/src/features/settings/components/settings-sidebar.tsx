'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Role } from '@rete/shared';
import { cn } from '@/lib/utils';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { useSession } from '@/features/auth';
import { SETTINGS_NAV } from '../lib/nav';

/**
 * 設定タブ専用サイドバー（モック settings/index.html のサイドバー意匠移植）。
 * アカウント / 権限 / セキュリティ / テナント の 4 グループ。
 * アクティブ判定は現在の pathname で行う（メンバーは /settings 完全一致、他は前方一致）。
 * adminOnly=true の項目は system Role=ADMIN のみ表示する（set-0028 組織管理/所属管理）。
 * set-0128: 下部のテナントメタ box（app-header のテナント名バッジと完全重複）を削除。
 * cmn-0128→rete-top-0004: hover グレー帯のスライド追従（app-sidebar/model-sidebar と同じ
 * useRowHoverBand・leaveOnNoMatch=true で非リンク領域へ移った時に帯を自動で消す）。
 */
export function SettingsSidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  const isAdmin = user?.role === Role.ADMIN;
  const { listRef, onMouseOver, onMouseLeave, bandStyle } = useRowHoverBand<HTMLDivElement>(
    // cmn-0133: active 行は帯の対象外（選択ピルが半透明の白＝下に帯が入ると透けて二重に見える）。
    '.sidebar-link:not(.active)',
    'vertical',
    true,
  );

  // adminOnly 項目を権限でフィルタ（空になったグループも除去）
  const visibleNav = SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-header">
        <h1>Setting</h1>
      </div>

      <div
        className="app-sidebar-scroll"
        ref={listRef}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {visibleNav.map((group) => (
          <div key={group.label} className="mt-2 first:mt-0">
            <div className="sidebar-section-label">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/settings'
                  ? pathname === '/settings'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn('sidebar-link', active && 'active')}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        {bandStyle ? <div aria-hidden className="app-sidebar-hoverband" style={bandStyle} /> : null}
      </div>
    </aside>
  );
}
