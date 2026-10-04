'use client';

import { useCallback } from 'react';
import type { ProjectDto } from '@rete/shared';
import { fetchProjects } from '../lib/api';
import { useAsyncList } from './use-async-list';

/**
 * プロジェクト一覧（CM-2 / ADR 0037）。organizationId 省略時は自分の全プロジェクト。
 * サイドバーは引数なしで 1 度取得し organizationId でクライアント集約する（組織数 N 回の往復を避ける）。
 */
export function useProjects(organizationId?: string) {
  const { items, loading, error, reload } = useAsyncList<ProjectDto>(
    useCallback(() => fetchProjects(organizationId), [organizationId]),
  );
  return { projects: items, loading, error, reload };
}
