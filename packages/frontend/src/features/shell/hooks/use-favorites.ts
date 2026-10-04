'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FavoriteDto } from '@rete/shared';
import {
  fetchFavorites,
  addFavorite,
  removeFavorite,
  reorderFavorites,
  type AddFavoriteInput,
} from '../lib/favorites-api';

export interface UseFavoritesResult {
  items: FavoriteDto[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  add: (input: AddFavoriteInput) => Promise<void>;
  /**
   * 複数件をまとめて追加し、再取得を 1 回だけ行う（files★ 一括登録 / HM-1-4）。
   * 1 件の失敗で残りを止めず、成功件数と失敗 label を集計して返す（呼び出し側が toast 表示）。
   */
  addMany: (inputs: AddFavoriteInput[]) => Promise<{ ok: number; failed: string[] }>;
  remove: (id: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
}

/**
 * HOME サイドバーの横断お気に入り（ユーザー別）の取得 + 追加/削除/並び替え。
 * 一覧は backend が sortOrder 昇順で返す。reorder は楽観更新（先にローカルを並べ替え、
 * 失敗時は確定済みデータへロールバック）でドラッグ体感を滑らかにする。add/remove は
 * 一覧を再取得して整合させる（sortOrder の採番は backend が握るため）。
 */
export function useFavorites(): UseFavoritesResult {
  const [items, setItems] = useState<FavoriteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchFavorites());
    } catch {
      setError('お気に入りの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (input: AddFavoriteInput) => {
      await addFavorite(input);
      await load();
    },
    [load],
  );

  const addMany = useCallback(
    async (inputs: AddFavoriteInput[]) => {
      const failed: string[] = [];
      let ok = 0;
      for (const input of inputs) {
        try {
          await addFavorite(input);
          ok += 1;
        } catch {
          failed.push(input.label);
        }
      }
      // 1 件でも追加できた時だけ再取得（add 毎の N+1 refetch を避け、ループ後に 1 回へ集約）。
      if (ok > 0) await load();
      return { ok, failed };
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeFavorite(id);
      await load();
    },
    [load],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      // 楽観更新: orderedIds の順に並べ替えてから永続化。失敗時は確定データへロールバック。
      const prev = items;
      const byId = new Map(prev.map((f) => [f.id, f]));
      const optimistic = orderedIds.map((id) => byId.get(id)).filter((f): f is FavoriteDto => !!f);
      setItems(optimistic);
      try {
        setItems(await reorderFavorites(orderedIds));
      } catch {
        setItems(prev);
        setError('並び替えに失敗しました');
      }
    },
    [items],
  );

  return { items, loading, error, refetch: load, add, addMany, remove, reorder };
}
