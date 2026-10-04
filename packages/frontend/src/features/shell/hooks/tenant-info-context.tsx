'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { TenantInfo } from '@/features/settings/lib/sample/tenant-settings';
import { fetchTenantInfo } from '@/features/settings/lib/api';

export interface TenantInfoContextValue {
  /** 取得済みテナント情報。ロード前は null。 */
  tenantInfo: TenantInfo | null;
  loading: boolean;
  /**
   * ローカル state を即時更新する（テナント設定の保存成功後に同一タブ反映する用途）。
   * サーバ再取得はしない。
   */
  setTenantInfo: (info: TenantInfo) => void;
  /** サーバから再取得。 */
  refetch: () => Promise<void>;
}

/**
 * ヘッダ左端テナントバッジ用の共有 state（set-0105 / ST-1-4）。
 * 認証済みシェル（AppShell）配下にのみ mount し、未ログイン時は描画されない＝無駄な 401 fetch を避ける
 * （FavoritesProvider と同型）。
 */
const TenantInfoContext = createContext<TenantInfoContextValue | null>(null);

/**
 * モジュールレベルキャッシュ（mdl-0038）。AppShell は各 page が持つためタブ遷移のたび
 * Provider ごと再マウントされ、useState(null) 始まりだと fetch 完了までバッジが消えて
 * 中央寄せのタブ列が横に飛ぶ（画面揺れ）。初期値をここから復元し、初回フレームから
 * バッジを描画する。fetch は従来どおり走らせて背景更新する。
 */
let cachedTenantInfo: TenantInfo | null = null;

/** リセット世代。reset をまたいで解決した in-flight fetch の書き戻しを無視するための番号。 */
let cacheGeneration = 0;

/**
 * ログアウト時に呼ぶ。モジュールレベルのキャッシュは client-side nav では生き続けるため、
 * リセットしないと次にログインした別テナントのユーザーへ前テナントのバッジが一瞬漏れる
 * （resetColumnWidthsStore と同型）。世代を進め、リセット前に発行済みの fetch が後から
 * 解決してもキャッシュへ書き戻らないようにする。
 */
export function resetTenantInfoCache(): void {
  cachedTenantInfo = null;
  cacheGeneration += 1;
}

export function TenantInfoProvider({ children }: { children: ReactNode }) {
  const [tenantInfo, setTenantInfoState] = useState<TenantInfo | null>(cachedTenantInfo);
  const [loading, setLoading] = useState(cachedTenantInfo === null);

  const refetch = useCallback(async () => {
    const generation = cacheGeneration;
    setLoading(true);
    try {
      const info = await fetchTenantInfo();
      // fetch 中に reset（ログアウト）が走っていたら、この結果は前テナントのもの＝捨てる
      if (generation !== cacheGeneration) return;
      cachedTenantInfo = info;
      setTenantInfoState(info);
    } catch {
      // ヘッダ表示は補助情報。失敗してもシェルは継続（お気に入りと同様に握り潰し）。
      // キャッシュ済みの表示は消さない（消すとタブ遷移のたびバッジが明滅し揺れが再発する）。
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const setTenantInfo = useCallback((info: TenantInfo) => {
    cachedTenantInfo = info;
    setTenantInfoState(info);
  }, []);

  return (
    <TenantInfoContext.Provider value={{ tenantInfo, loading, setTenantInfo, refetch }}>
      {children}
    </TenantInfoContext.Provider>
  );
}

/** 共有テナント情報を取得する。TenantInfoProvider の外で呼ぶと throw する（mount 漏れの早期検出）。 */
export function useTenantInfoContext(): TenantInfoContextValue {
  const ctx = useContext(TenantInfoContext);
  if (ctx === null) {
    throw new Error('useTenantInfoContext は TenantInfoProvider の内側で使用してください');
  }
  return ctx;
}
