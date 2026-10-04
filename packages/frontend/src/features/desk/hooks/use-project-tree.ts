'use client';

import { useEffect, useMemo } from 'react';
import type { ProjectDto } from '@rete/shared';

/**
 * 組織＞プロジェクト＞チャネル ツリーの共有規律（fil-0145）。
 *
 * Desk サイドバーと Files サイドバーで別々に実装されていた「プロジェクト一覧の組織別集約」と
 * 「プロジェクト展開時だけのチャネル lazy 取得」をここへ一本化する。共有するのはデータ集約と
 * 取得タイミングの規律だけで、行の描画・折り畳み状態・管理導線は各画面の管轄のまま。
 */

/** organizationId → プロジェクト群に集約（1 回取得を組織別に振り分け）。 */
export function useProjectsByOrg(projects: ProjectDto[]): Record<string, ProjectDto[]> {
  return useMemo(() => {
    const map: Record<string, ProjectDto[]> = {};
    for (const p of projects) {
      (map[p.organizationId] ??= []).push(p);
    }
    return map;
  }, [projects]);
}

/**
 * 展開時にそのプロジェクトのチャネルを lazy 取得する（折り畳み中は取得しない＝N+1 回避）。
 * loadChannels は取得済み / 取得中を useProjectChannels 側で抑止するため再描画ごとに呼んでも安全。
 */
export function useLazyChannelLoad(
  expanded: boolean,
  projectId: string,
  loadChannels: (projectId: string) => void,
): void {
  useEffect(() => {
    if (expanded) loadChannels(projectId);
  }, [expanded, projectId, loadChannels]);
}
