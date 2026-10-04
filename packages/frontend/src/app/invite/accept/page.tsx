import { Suspense } from 'react';
import { AcceptView } from '@/features/invite';

/**
 * 招待受諾ページ（公開・未ログイン表示可）。
 * URL: /invite/accept?token=<トークン>
 * AcceptView が useSearchParams を使うため Suspense 境界が必要（Next 15 app router）。
 * AppShell を使わないため認証チェックに巻き込まれない（login ページと同じ構成）。
 */
export default function Page() {
  return (
    <Suspense>
      <AcceptView />
    </Suspense>
  );
}
