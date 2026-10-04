'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchChatThemes,
  createChatTheme,
  type ChatThemeSummary,
  type ChatThemeListParams,
} from '../lib/api';
import { useDeskSpace } from './desk-space-context';

export interface UseChatThemesResult {
  themes: ChatThemeSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createTheme: (input: {
    title: string;
    description?: string;
    descriptionMentionAccountIds?: string[];
  }) => Promise<ChatThemeSummary>;
  /**
   * サーバー絞り込みパラメータ（search / archive / 顛末 / mention From/To）を差し替えて再取得する。
   * 値が現在のパラメータと等価なら再取得しない（マウント直後の二重取得を防ぐ）。
   * 値は ref 保持され refetch / createTheme 後の reload でも維持される。
   */
  setServerFilter: (params: ServerFilter) => void;
  /**
   * 指定テーマの未読フラグをローカルで落とす（楽観的既読化 / rete-desk-0075）。
   * スレッドを開いた瞬間に題名太字を消すため、backend の既読化（detail GET 副作用）完了を待たず
   * 一覧 state を即更新する。次回 refetch でサーバー値（既読化済）と整合する。
   */
  markThemeReadLocal: (themeId: string) => void;
}

/**
 * サーバー側で絞り込むテーマ一覧パラメータ（rete-desk-0049 §5.3 A案 + チャットフィルタ server 統一）。
 * keyword / archive / 顛末 もクライアント絞り込みから server へ寄せ、ページング越しに効くようにした。
 */
interface ServerFilter {
  search?: string;
  archiveOnly?: boolean;
  tenmatsuOnly?: boolean;
  mentionFrom: string[];
  mentionTo: string[];
  /** 器（Space）スコープ（CM-2 / ADR 0037）。未指定＝全件。フィルタではなくスコープ（空判定に数えない）。 */
  spaceId?: string;
}

/** 値ベースの文字列配列比較（順序込み）。参照が変わっても中身が同じなら再取得しない判定に使う。 */
function arrayEquals(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** チャット明細（テーマ一覧）の取得 + 新規テーマ作成。mention は §5.3 A案でサーバー絞り込みする。 */
export function useChatThemes(): UseChatThemesResult {
  const [themes, setThemes] = useState<ChatThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 現在開いている器スコープ（Context・即時反映）。createTheme は serverFilterRef（250ms debounce 経由で
  // 遅れて更新される）ではなく、この live 値を ref ミラーで参照し、チャネル選択直後に作ったテーマが
  // 旧スコープへ刻印される race を防ぐ（CM-2・debounce 窓の不整合）。
  const { selectedSpaceId, hydrated } = useDeskSpace();
  const liveSpaceIdRef = useRef<string | null>(selectedSpaceId);
  liveSpaceIdRef.current = selectedSpaceId;
  // 初回ロード済みか。create / reply / フィルタ後の再取得では一覧を全面スピナーへ差し替えず（再マウント抑止）、
  // 既存リストを表示したまま背景更新する。これによりスクロール容器が維持され、最下端追従（rete-desk-0109）が
  // レイアウト確定前に流れる不具合を防ぐ。
  const hasLoadedRef = useRef(false);
  // 現在のサーバー絞り込み。初期は全件（フィルタなし）。load / refetch はこの ref を読むため、
  // mutation 後の reload でもフィルタが維持される。
  const serverFilterRef = useRef<ServerFilter>({
    search: undefined,
    archiveOnly: false,
    tenmatsuOnly: false,
    mentionFrom: [],
    mentionTo: [],
    spaceId: undefined,
  });

  const load = useCallback(async () => {
    // 全面スピナーは初回のみ。以降の再取得は既存リストを保ったまま更新する（再マウント抑止）。
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const sf = serverFilterRef.current;
      // falsy（空文字 / false）なスカラーは送らず URL を汚さない。mention は空配列でも従来どおり渡す。
      const params: ChatThemeListParams = { mentionFrom: sf.mentionFrom, mentionTo: sf.mentionTo };
      if (sf.search) params.search = sf.search;
      if (sf.archiveOnly) params.archiveOnly = true;
      if (sf.tenmatsuOnly) params.tenmatsuOnly = true;
      if (sf.spaceId) params.spaceId = sf.spaceId;
      const res = await fetchChatThemes(params);
      setThemes(res.data);
      hasLoadedRef.current = true;
    } catch {
      setError('チャットの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回取得は器スコープを serverFilter に載せてから行う（rete-desk-0174・ちらつき対策の本丸）。
  // 前段の DeskShellGate（desk-page.tsx）が hydrated=true まで DeskShell を mount しないため、本 hook が
  // mount する時点で selectedSpaceId は復元済み。にもかかわらず旧実装は初回 load を serverFilterRef.spaceId=
  // undefined のまま走らせ「全件を取得→描画」、その後 desk-shell の setServerFilter（250ms debounce）で器が
  // 適用され再取得＝「全件 → 復元した器」の2段フラッシュ（明細件数が一瞬多く見える）が残っていた。
  // 対策: 復元済みスコープ（liveSpaceIdRef）を serverFilter に seed してから load し、初回から scoped に描く。
  // hydrated ゲートは DeskShellGate 不在の文脈（単体テスト等）向けの防御（Provider 不在なら FALLBACK.hydrated
  // =true で従来どおり即取得）。liveSpaceIdRef は render 本体で同期更新され、localStorage 復元時の
  // setSelected+setHydrated は React18 自動バッチで同一レンダリングに乗るため、hydrated=true 時点で最新値を持つ。
  // 以降のスコープ / フィルタ変更は setServerFilter（desk-shell）が担い、serverFilter 等価なら再取得は抑止される。
  useEffect(() => {
    if (!hydrated) return;
    serverFilterRef.current.spaceId = liveSpaceIdRef.current ?? undefined;
    void load();
  }, [hydrated, load]);

  const setServerFilter = useCallback(
    (params: ServerFilter) => {
      const cur = serverFilterRef.current;
      // スカラーは normalize して比較・保持する（undefined と '' / false を同一視し、無駄な再取得を防ぐ）。
      const next: ServerFilter = {
        search: params.search || undefined,
        archiveOnly: !!params.archiveOnly,
        tenmatsuOnly: !!params.tenmatsuOnly,
        mentionFrom: params.mentionFrom,
        mentionTo: params.mentionTo,
        spaceId: params.spaceId || undefined,
      };
      const same =
        (cur.search || undefined) === next.search &&
        !!cur.archiveOnly === next.archiveOnly &&
        !!cur.tenmatsuOnly === next.tenmatsuOnly &&
        arrayEquals(cur.mentionFrom, next.mentionFrom) &&
        arrayEquals(cur.mentionTo, next.mentionTo) &&
        (cur.spaceId || undefined) === next.spaceId;
      serverFilterRef.current = next;
      // 値が等価なら再取得しない（マウント時の初期 push と内部 load の二重発火を抑止）。
      if (!same) void load();
    },
    [load],
  );

  const createTheme = useCallback(
    async (input: {
      title: string;
      description?: string;
      descriptionMentionAccountIds?: string[];
    }) => {
      // 器スコープ選択中なら新規テーマを其の器に刻印する（未選択＝backend が DEFAULT_CHANNEL に収容）。
      // これにより「チャネル選択中に作ったテーマが現在のスコープから消える」迷子化を防ぐ（CM-2）。
      // live 値（Context）を読む＝serverFilterRef の debounce 遅延による旧スコープ刻印を回避。
      const created = await createChatTheme({
        ...input,
        spaceId: liveSpaceIdRef.current ?? undefined,
      });
      await load();
      return created;
    },
    [load],
  );

  const markThemeReadLocal = useCallback((themeId: string) => {
    setThemes((prev) =>
      prev.map((t) => (t.id === themeId && t.hasUnread ? { ...t, hasUnread: false } : t)),
    );
  }, []);

  return {
    themes,
    loading,
    error,
    refetch: load,
    createTheme,
    setServerFilter,
    markThemeReadLocal,
  };
}
