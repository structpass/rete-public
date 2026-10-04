import { DashboardView } from '@/features/dashboard/components/dashboard-view';

// FAQ 画面（hom-0073）。共通シェルは hub/layout.tsx が担い、本ページは kind="faq" のみ差し替える（hom-0077）。
export default function Page() {
  return <DashboardView kind="faq" />;
}
