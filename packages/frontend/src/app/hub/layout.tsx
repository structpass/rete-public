'use client';

import { useState, type ReactNode } from 'react';
import { Role } from '@rete/shared';
import { AppShell } from '@/features/shell';
import { AppSidebar } from '@/features/shell/components/app-sidebar';
import { useSession } from '@/features/auth/hooks/use-session';
import { AnnouncementTagMasterOverlay } from '@/features/dashboard/components/announcement-tag-master-overlay';

/**
 * home(hub) タブ共通レイアウト（hom-0077）。`/hub`（掲示板）と `/hub/faq` が本レイアウトを共有することで、
 * AppShell（サイドバー・お気に入り取得等の Provider 群）がタブ切替のたびに再mountされず、
 * 切替時のチラつきを防ぐ。settings/layout.tsx と同型。
 *
 * 旧 hub-view.tsx が持っていた AppShell 組み立て（sidebar prop・showTagMaster state・
 * AnnouncementTagMasterOverlay）をここへ移植。各 page.tsx は DashboardView(kind違い)のみを返す。
 */
export default function HubLayout({ children }: { children: ReactNode }) {
  const [showTagMaster, setShowTagMaster] = useState(false);
  const { user } = useSession();
  const isAdmin = user?.role === Role.ADMIN;

  return (
    <AppShell
      activeTab="home"
      sidebar={<AppSidebar onOpenTagMaster={isAdmin ? () => setShowTagMaster(true) : undefined} />}
    >
      {children}
      {showTagMaster && <AnnouncementTagMasterOverlay onClose={() => setShowTagMaster(false)} />}
    </AppShell>
  );
}
