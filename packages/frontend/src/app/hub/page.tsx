import { DashboardView } from '@/features/dashboard/components/dashboard-view';

// ログイン後の起点 = 掲示板ダッシュボード。共通シェル（サイドバー・タグ管理）は hub/layout.tsx が担う（hom-0077）。
export default function Page() {
  return <DashboardView kind="board" />;
}
