'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchHubMenu, type HubMenuItem } from '@/features/hub';
import {
  applyDisplayPreference,
  fetchDisplayPreference,
} from '@/features/settings/lib/display-preference-api';
import { fetchMe, type AccountResponse } from '../lib/api';

interface SessionContextValue {
  /** ログインユーザー。未ログインは null。 */
  user: AccountResponse | null;
  /** 初回の /auth/me 解決待ちか。アプリ起動時のみ true → 以降の画面遷移では false 固定。 */
  loading: boolean;
  /** hub menu（「システム」タブの遷移先解決用）。未取得 / 失敗時は空配列。 */
  menuItems: HubMenuItem[];
  /**
   * session を更新する。ログイン成功後に確定アカウントを反映 / ログアウト時に null クリアする。
   * /auth/me の再取得を待たずに context を最新化し、遷移直後の誤リダイレクト・stale 残留を防ぐ。
   */
  setUser: (user: AccountResponse | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * ログイン session と hub menu をアプリ全体で 1 回だけ取得し、context で共有するプロバイダ。
 * root layout 直下に置くことで画面遷移を跨いで生存し、タブ切替のたびに /auth/me を
 * 叩き直して全画面スピナーをフラッシュする再マウントコストを排除する（旧 AppShell の挙動を是正）。
 * cookie は httpOnly のため JS から判定できず、backend への問い合わせが唯一の判定手段。
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<HubMenuItem[]>([]);

  // /auth/me は起動時 1 回。未ログインは 200 + data:null（user=null）として扱う（ADR 0030 / rete-files-0024）。
  // catch はネットワーク等の真のエラー用フォールバック（こちらも user=null に倒す）。
  // cmn-0410: 初回 fetch でスロットル基準時刻を進める（起動直後 60 秒内のタブ復帰で 2 リクエスト目が飛ぶのを防ぐ）。
  // 応答は世代チェックを経由（先行する in-flight 応答に新しい表示を上書きされない）。
  useEffect(() => {
    let active = true;
    lastRefreshAtRef.current = Date.now();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    fetchMe()
      .then((u) => {
        if (active && generationRef.current === generation) setUser(u);
      })
      .catch(() => {
        if (active && generationRef.current === generation) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // cmn-0382: 他タブ / 別アプリから rete へ戻った時にログイン情報を取り直す。
  // 起動時 1 回のキャッシュだけだと、管理者のロール無効化後も既存セッションの画面に旧権限の操作導線が
  // 出続ける（backend guard は毎リクエスト enforce するため権限漏れは無い＝表示鮮度のみの問題）。
  // - 60 秒スロットル: 短時間のタブ行き来で通信が積み上がらないようにする（criteria 3）。スロットルの
  //   基準時刻は fetch 前に進める＝失敗時も窓内は再試行しない（連打でのリトライ嵐を作らない）。
  // - 失敗時は setUser を呼ばない: 一時的な通信断でログイン状態表示を失わない（criteria 2）。
  //   未ログインへの null 化は初回 useEffect の catch の責務のまま。成功応答が null（セッション失効）の
  //   場合は実体どおり未ログインへ更新する（表示だけ残しても以後の API は全て 401 になるため）。
  const lastRefreshAtRef = useRef(0);
  // cmn-0410: in-flight の /auth/me 応答が後着で新しい表示を上書きしないための世代カウンタ。
  // 発射時にインクリメントし、応答時に「発射した世代が最新世代のままか」を確認してから setUser する。
  // setUser も世代を進める（ログイン/ログアウト操作を最新とみなし、先行する in-flight 応答を無効化する）。
  const generationRef = useRef(0);

  const commitUser = useCallback((u: AccountResponse | null) => {
    generationRef.current += 1;
    setUser(u);
  }, []);

  useEffect(() => {
    let active = true;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 60_000) return;
      lastRefreshAtRef.current = now;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      fetchMe()
        .then((u) => {
          if (active && generationRef.current === generation) setUser(u);
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // 表示個人設定（明細の縞模様 / mdl-0022）はログイン確定後に 1 回だけ :root へ反映する。
  // 設定画面での保存はここを再実行しない＝「再ログインしたタイミングで反映」の仕様どおり。
  // 取得失敗・未保存は CSS 既定（縞 ON・#FAFCFF）のまま静かに描画する（best-effort・mdl-0052）。
  useEffect(() => {
    if (!user) {
      applyDisplayPreference(null);
      return;
    }
    let active = true;
    fetchDisplayPreference()
      .then((pref) => {
        if (active) applyDisplayPreference(pref);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // hub menu はログイン確定後に 1 回だけ。失敗してもシステムタブが灰色になるだけ。
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchHubMenu()
      .then((m) => {
        if (active) setMenuItems(m.items);
      })
      .catch(() => {
        if (active) setMenuItems([]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <SessionContext.Provider value={{ user, loading, menuItems, setUser: commitUser }}>
      {children}
    </SessionContext.Provider>
  );
}

/** SessionProvider 配下で session 全体（user / loading / menuItems）を読む。 */
export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return ctx;
}
