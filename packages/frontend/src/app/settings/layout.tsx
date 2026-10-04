import type { ReactNode } from 'react';
import { AppShell } from '@/features/shell';
import { SettingsSidebar } from '@/features/settings';

/**
 * 設定タブ共通レイアウト。AppShell（上部タブ + 左サイドバー枠）に設定専用サイドバーを差し込み、
 * 配下のネストルート（メンバー / 招待 / 権限 / 操作ログ / ログイン設定 / テナント設定）を children に流す。
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell activeTab="settings" sidebar={<SettingsSidebar />}>
      {children}
    </AppShell>
  );
}
