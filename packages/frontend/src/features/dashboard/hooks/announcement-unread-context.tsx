'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchAnnouncementUnreadCount, type AnnouncementTagKind } from '../lib/api';

/**
 * 通知（掲示板/FAQ）の未読総数を共有する state（HM-3・ADR 0029・hom-0073 で kind 別に分離）。
 * FavoritesProvider と同型。サイドバー「通知管理」の各項目バッジ（AppSidebar）と対応する画面
 * （DashboardView・kind 別）が同一カウントを参照し、詳細を開いて既読化した瞬間に decrement で
 * 即時減算する（往復を増やさない楽観更新）。掲示板/FAQ はサイドバーで別項目のため、合算ではなく
 * kind ごとに独立してカウントする（AnnouncementTagMasterProvider の board/faq 分離と同型）。
 *
 * 認証済みシェル（AppShell）配下にのみ mount され、未ログイン時は描画されない＝無駄な 401 fetch を避ける。
 */
interface AnnouncementUnreadValue {
  /** 自分の未読通知総数（該当 kind・全ページ横断）。 */
  unreadCount: number;
  loading: boolean;
  /** 1 件既読化したときの楽観デクリメント（0 未満にしない）。 */
  decrement: () => void;
  /** backend から再取得して同期する。 */
  refresh: () => Promise<void>;
}

interface AnnouncementUnreadContextValue {
  board: AnnouncementUnreadValue;
  faq: AnnouncementUnreadValue;
}

const AnnouncementUnreadContext = createContext<AnnouncementUnreadContextValue | null>(null);

/** kind 1 つぶんの未読カウント state（board/faq で 2 インスタンス生成する）。 */
function useUnreadKindState(kind: AnnouncementTagKind): AnnouncementUnreadValue {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUnreadCount(await fetchAnnouncementUnreadCount(kind));
    } catch {
      // 未読数の取得失敗はバッジ非表示（0 据え置き）で握る。致命ではなく本筋の閲覧を妨げない。
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decrement = useCallback(() => setUnreadCount((n) => Math.max(0, n - 1)), []);

  return { unreadCount, loading, decrement, refresh };
}

export function AnnouncementUnreadProvider({ children }: { children: ReactNode }) {
  const board = useUnreadKindState('board');
  const faq = useUnreadKindState('faq');

  return (
    <AnnouncementUnreadContext.Provider value={{ board, faq }}>
      {children}
    </AnnouncementUnreadContext.Provider>
  );
}

/** 共有未読カウントを取得する（kind 省略時は 'board'）。Provider の外で呼ぶと throw する（mount 漏れの早期検出）。 */
export function useAnnouncementUnread(
  kind: AnnouncementTagKind = 'board',
): AnnouncementUnreadValue {
  const ctx = useContext(AnnouncementUnreadContext);
  if (ctx === null) {
    throw new Error('useAnnouncementUnread は AnnouncementUnreadProvider の内側で使用してください');
  }
  return kind === 'faq' ? ctx.faq : ctx.board;
}
