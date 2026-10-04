'use client';

import { useCallback, useEffect, useState } from 'react';

/** サイドバーのスコープタブ（CM-2 / ADR 0037・組織 | グループ | 個人の 3 タブ）。 */
export type DeskSidebarTab = 'organization' | 'group' | 'personal';

export interface DeskSidebarState {
  activeTab: DeskSidebarTab;
  /** 折り畳みキー（projectId 等）→ 折り畳み中か（true=畳む / 未設定=展開）。 */
  collapsed: Record<string, boolean>;
}

export interface UseDeskSidebarStateResult extends DeskSidebarState {
  setTab: (tab: DeskSidebarTab) => void;
  toggleProject: (projectId: string) => void;
  /**
   * localStorage からの復元が解決済みか（rete-desk-0174・ちらつき対策）。
   * false の間は既定タブ（organization）のパネルを描かないよう呼び出し側がゲートし、
   * 「組織パネル → 最後に開いていたタブ」の 2 段描画フラッシュを防ぐ。
   */
  hydrated: boolean;
}

// v1 → v2 バンプ（CM-2 スライスB）。旧スキーマは selectedChannelId / selectedMemberId に mock id を保持していたため、
// そのまま引き継ぐと実 API 化後に存在しない器を指してしまう。選択（selectedSpaceId）は desk-space-context へ移管し、
// 本 hook は純 UI 状態（タブ / 折り畳み）のみを保持する。
export const STORAGE_KEY = 'desk-sidebar-state-v2';
/** v1 の旧キー。復元時に一度だけ掃除して storage の孤立エントリを残さない。 */
const LEGACY_STORAGE_KEY = 'desk-sidebar-state';

const TABS: readonly DeskSidebarTab[] = ['organization', 'group', 'personal'];

/** 既定: 組織タブ・全プロジェクト展開。選択（器）は context 側で初期値 null（未選択 = 全件）。 */
const DEFAULT_STATE: DeskSidebarState = {
  activeTab: 'organization',
  collapsed: {},
};

/**
 * localStorage から読んだ任意値を既知フィールドだけに絞り runtime 検証する。
 * 型不一致（手動改ざん / 別バージョンの保存スキーマ）のフィールドは黙って捨て、既定値に委ねる。
 */
function sanitize(parsed: unknown): Partial<DeskSidebarState> {
  if (typeof parsed !== 'object' || parsed === null) return {};
  const p = parsed as Record<string, unknown>;
  const out: Partial<DeskSidebarState> = {};
  if (typeof p.activeTab === 'string' && (TABS as readonly string[]).includes(p.activeTab)) {
    out.activeTab = p.activeTab as DeskSidebarTab;
  }
  if (typeof p.collapsed === 'object' && p.collapsed !== null) {
    out.collapsed = p.collapsed as Record<string, boolean>;
  }
  return out;
}

/**
 * Desk サイドバーの純 UI 状態（スコープタブ / プロジェクト折り畳み）を localStorage 永続化する。
 *
 * 「どの器を開いているか（selectedSpaceId）」は本 hook ではなく desk-space-context が保持する（DeskShell が
 * 読み、絞り込みに使うため state を昇格した / 論点1・2）。本 hook は見た目の開閉状態のみを扱う。
 *
 * SSR 安全: 初回は既定値で描画し、マウント後に localStorage から復元する（hydration mismatch 回避）。
 * 復元完了後の変更だけ永続化し、マウント直後の既定値書込みで保存値を潰さない。
 */
export function useDeskSidebarState(): UseDeskSidebarStateResult {
  const [state, setState] = useState<DeskSidebarState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const restored = sanitize(JSON.parse(raw));
        setState((prev) => ({ ...prev, ...restored }));
      }
      // v1 の孤立エントリ（mock id を保持していた旧スキーマ）を掃除する。
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // プライベートモード / JSON 破損などは無視し既定値のまま使う。
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 容量超過 / 書込み不可は無視（永続化はベストエフォート）。
    }
  }, [state, hydrated]);

  const setTab = useCallback(
    (tab: DeskSidebarTab) => setState((s) => ({ ...s, activeTab: tab })),
    [],
  );

  const toggleProject = useCallback(
    (projectId: string) =>
      setState((s) => ({
        ...s,
        collapsed: { ...s.collapsed, [projectId]: !s.collapsed[projectId] },
      })),
    [],
  );

  return { ...state, setTab, toggleProject, hydrated };
}
