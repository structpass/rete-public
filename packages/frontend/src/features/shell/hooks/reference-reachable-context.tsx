'use client';

import { createContext, useContext } from 'react';

/**
 * reference（システムタブの遷移先）の実起動確認結果を、シェル配下の子（ヘッダタブ / サイドバーお気に入り）で
 * 共有するコンテキスト（rete-files-0037 / common-0018）。probe（`useReferenceReachable`）は AppShell で 1 回だけ
 * 実行し、その boolean をここへ流す。AppSidebar など複数の遷移経路が同じ結果を読むことで二重 probe を避ける。
 *
 * 既定値 `true` = 楽観的に到達可能（Provider 外 / 確認前はグレーにしない）。
 */
const ReferenceReachableContext = createContext<boolean>(true);

export const ReferenceReachableProvider = ReferenceReachableContext.Provider;

/** シェル配下で reference の実到達可否（probe 結果）を読む。Provider 外では `true`（楽観）。 */
export function useReferenceReachableValue(): boolean {
  return useContext(ReferenceReachableContext);
}
