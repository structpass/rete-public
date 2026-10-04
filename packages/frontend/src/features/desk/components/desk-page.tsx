'use client';

import { AppShell } from '@/features/shell';
import { DeskSpaceProvider, useDeskSpace } from '../hooks/desk-space-context';
import { DeskShell } from './desk-shell';
import { DeskSidebar } from './desk-sidebar';

/**
 * 器スコープ（selectedSpaceId）の復元が確定するまで DeskShell を mount しないゲート（rete-desk-0174）。
 *
 * selectedSpaceId は初期 null（全件）→ マウント後の useEffect で localStorage / deep-link から復元される。
 * 復元前に DeskShell を描くと「全件のチャット明細 / タスク明細」を一瞬出してから最後に開いていた器へ
 * 切り替わる 2 段描画フラッシュが起きる（かつ全件 → 絞り込みの二重 fetch も走る）。hydrated が立つまで
 * 空の sp-page だけを描き、確定後に正しい器で 1 度だけ DeskShell を mount する（最初の fetch から正しい spaceId）。
 */
function DeskShellGate() {
  const { hydrated } = useDeskSpace();
  // 復元確定まではレイアウトだけ確保した空ペイン（既定スクリーンを描かない＝フラッシュ回避）。
  if (!hydrated) return <main className="sp-page" aria-hidden="true" />;
  return <DeskShell />;
}

/**
 * Desk タブのクライアントラッパ（CM-2 スライスB / 論点1）。
 *
 * app/desk/page.tsx は server component で <DeskSidebar/>（器を選択）と <DeskShell/>（器で絞る）が兄弟のため
 * 共通 state 親が無い。両者を DeskSpaceProvider 配下に入れて selectedSpaceId を共有する。
 * ?spaceId= deep-link（desk★ / nav-config の space ケース）は server 側で searchParams を受け取り、
 * initialSpaceId prop として供給する（dsk-0372）。旧実装の useSearchParams + Suspense（fallback 無し）は
 * AppShell を内包する境界となり home→desk 遷移時にシェルごと白化（全画面 600ms 空白）するため廃止。
 */
export function DeskPage({ initialSpaceId }: { initialSpaceId: string | null }) {
  return (
    <DeskSpaceProvider initialSpaceId={initialSpaceId}>
      <AppShell activeTab="desk" sidebar={<DeskSidebar />}>
        <DeskShellGate />
      </AppShell>
    </DeskSpaceProvider>
  );
}
