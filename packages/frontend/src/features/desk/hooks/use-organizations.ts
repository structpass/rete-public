'use client';

import { useCallback } from 'react';
import type { OrganizationDto } from '@rete/shared';
import { fetchOrganizations } from '../lib/api';
import { useAsyncList } from './use-async-list';

/** 自分が所属する組織一覧（CM-2 / ADR 0037）。サイドバー組織タブのルート。 */
export function useOrganizations() {
  const { items, loading, error, reload } = useAsyncList<OrganizationDto>(
    useCallback(() => fetchOrganizations(), []),
  );
  return { organizations: items, loading, error, reload };
}
