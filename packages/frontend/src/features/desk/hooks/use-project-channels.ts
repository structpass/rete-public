'use client';

import { useCallback, useRef, useState } from 'react';
import { type SpaceDto, SpaceKind } from '@rete/shared';
import { fetchSpaces } from '../lib/api';

export interface UseProjectChannelsResult {
  /** projectId → そのプロジェクトのチャネル（取得済みのみ・未取得キーは存在しない）。 */
  channelsByProject: Record<string, SpaceDto[]>;
  /** 取得中の projectId 集合（スピナー表示用）。 */
  loadingProjects: Set<string>;
  /** 指定プロジェクトのチャネルを lazy 取得する（取得済み / 取得中は no-op）。展開時に呼ぶ。 */
  loadChannels: (projectId: string) => void;
  /** 指定プロジェクトのチャネルを強制再取得する（作成 / 改名 / アーカイブ後の反映用・キャッシュを破棄して取り直す）。 */
  reloadChannels: (projectId: string) => Promise<void>;
}

/**
 * 組織タブの「プロジェクト展開時にそのチャネルだけ取得する」lazy ローダ（CM-2 / ADR 0037・N+1 回避）。
 * CHANNEL 一覧は projectId 必須（backend 仕様）なので全件一括取得はできず、展開された分のみ取得しキャッシュする。
 * 取得失敗は黙って空のまま（次回展開で再試行可・サイドバーが致命的に壊れない）。
 */
export function useProjectChannels(): UseProjectChannelsResult {
  const [channelsByProject, setChannelsByProject] = useState<Record<string, SpaceDto[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Set<string>>(new Set());
  // 取得済み / 取得中の二重発火を ref で抑止（state 反映前の連続展開でも 1 回に収める）。
  const requestedRef = useRef<Set<string>>(new Set());

  // 実取得。lazy 用（loadChannels）と強制再取得（reloadChannels）で共有する（§3）。
  const fetchInto = useCallback(async (projectId: string) => {
    requestedRef.current.add(projectId);
    setLoadingProjects((prev) => new Set(prev).add(projectId));
    try {
      const spaces = await fetchSpaces({ kind: SpaceKind.CHANNEL, projectId });
      setChannelsByProject((prev) => ({ ...prev, [projectId]: spaces }));
    } catch {
      // 取得失敗時は再試行できるよう requested から外す（キャッシュは作らない）。
      requestedRef.current.delete(projectId);
    } finally {
      setLoadingProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, []);

  const loadChannels = useCallback(
    (projectId: string) => {
      if (requestedRef.current.has(projectId)) return;
      void fetchInto(projectId);
    },
    [fetchInto],
  );

  const reloadChannels = useCallback((projectId: string) => fetchInto(projectId), [fetchInto]);

  return { channelsByProject, loadingProjects, loadChannels, reloadChannels };
}
