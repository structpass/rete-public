'use client';

import { useSessionContext } from '../components/session-provider';
import type { AccountResponse } from '../lib/api';

interface SessionState {
  user: AccountResponse | null;
  loading: boolean;
}

/**
 * 現在のログイン session（user / loading）を読む client hook。
 * 実体は SessionProvider が起動時 1 回だけ取得した値を context から返すだけで、
 * 呼ぶたびに /auth/me を叩くことはない（画面遷移ごとの再取得・スピナー化を防ぐ）。
 */
export function useSession(): SessionState {
  const { user, loading } = useSessionContext();
  return { user, loading };
}
