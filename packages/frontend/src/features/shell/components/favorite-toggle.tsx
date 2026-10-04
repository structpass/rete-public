'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import type { FavoriteDto } from '@rete/shared';
import { cn } from '@/lib/utils';
import { useFavoritesContext } from '../hooks/favorites-context';

/** ★トグルの対象リソース（FavoriteDto の登録用最小集合）。targetRef は精密 id（files=フォルダ id / desk=mock:type:id）。 */
export type FavoriteTarget = Pick<FavoriteDto, 'kind' | 'targetRef' | 'label'>;

/**
 * 横断お気に入りの★トグル（HM-1-4）。お気に入りの「2 つ目の入口」で、各タブの現在コンテキスト
 * （files=現在フォルダ / desk=選択中チャネル・グループ・DM）を共有 state に add/remove する。
 * 登録判定は共有 state の items に対する kind+targetRef の精密一致。処理中は多重送信を禁じる。
 * 見た目はモック index.html の `.fav-toggle`（active で塗りつぶし★）を踏襲する。
 */
export function FavoriteToggle({ target }: { target: FavoriteTarget }) {
  const { items, add, remove } = useFavoritesContext();
  const [busy, setBusy] = useState(false);

  const existing = items.find((f) => f.kind === target.kind && f.targetRef === target.targetRef);
  const favorited = existing != null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (existing) {
        await remove(existing.id);
      } else {
        await add({ kind: target.kind, targetRef: target.targetRef, label: target.label });
      }
    } catch {
      // useFavorites.add/remove は失敗時に error state を立てず例外を投げるため、
      // ★トグルには表示スロットが無い。プロジェクト共通の toast でフィードバックする。
      toast.error('お気に入りの更新に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={cn('fav-toggle', favorited && 'active')}
      aria-pressed={favorited}
      aria-label={favorited ? 'お気に入りから削除' : 'お気に入りに追加'}
      disabled={busy}
      onClick={() => void handleClick()}
    >
      <Star aria-hidden="true" fill={favorited ? 'currentColor' : 'none'} />
    </button>
  );
}
