import { ModelView } from '@/features/model';

// モデルタブ（rete 固有共通仕様カタログ）。サイドバー + 本文の2ペイン合成は ModelView に閉じ込める。
export default function Page() {
  return <ModelView />;
}
