import { DeskPage } from '@/features/desk';

// Desk タブ（チャット / タスクの 2 ペイン）。?spaceId= 取り込みは server 側で searchParams を await して
// DeskPage（client）に prop で渡す（dsk-0372）。旧実装は useSearchParams をクライアントで呼ぶ都合で
// <Suspense fallback={null}> に包んでおり、fallback 無し＋ AppShell を内包する構造が home→desk 遷移の
// 約 600ms シェルごと白化の原因になっていた。searchParams を server へ移すことで境界自体を消す。
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ spaceId?: string }>;
}) {
  const params = await searchParams;
  return <DeskPage initialSpaceId={params.spaceId ?? null} />;
}
