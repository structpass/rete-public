'use client';

import { useEffect, useState } from 'react';
import type { ReferenceObjectTypeSummary } from '@rete/shared';
import { fetchReferenceObjectTypes } from '../lib/favorites-api';

/**
 * reference（struct-pass-reference）の ObjectType 種別一覧を取得するフック（hom-0067）。
 * rete backend の proxy API 経由で取得し、rete frontend が reference API を直接叩かない（criteria【1】）。
 *
 * - 取得失敗・reference 未起動時は縮退（空配列）で、お気に入り機能全体を止めない（criteria【5】）。
 * - `enabled` が false（ADMIN 以外・未ログイン等）の時は取得しない。
 */
export function useReferenceObjectTypes(enabled: boolean): ReferenceObjectTypeSummary[] {
  const [items, setItems] = useState<ReferenceObjectTypeSummary[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchReferenceObjectTypes()
      .then((list) => {
        if (active) setItems(list);
      })
      .catch(() => {
        // 縮退: 空のまま（取得できなくてもお気に入り機能は動く）。
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return items;
}
