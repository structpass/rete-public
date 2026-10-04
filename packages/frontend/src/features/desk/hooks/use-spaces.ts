'use client';

import { useCallback } from 'react';
import { type SpaceDto, SpaceKind } from '@rete/shared';
import { fetchSpaces } from '../lib/api';
import { useAsyncList } from './use-async-list';

/**
 * 器（Space）一覧（CM-2 / ADR 0037）。kind を必ず指定して取得する（未指定は backend が id リストのみ返す）。
 * グループタブ（kind=GROUP）/ 個人タブ（kind=PERSONAL_MEMO / PERSONAL_DM）で kind 別に呼び分ける。
 * CHANNEL の lazy 取得は use-project-channels が担う（projectId 必須・展開時取得のため別 hook）。
 */
export function useSpaces(kind: SpaceKind) {
  const { items, loading, error, reload } = useAsyncList<SpaceDto>(
    useCallback(() => fetchSpaces({ kind }), [kind]),
  );
  return { spaces: items, loading, error, reload };
}
