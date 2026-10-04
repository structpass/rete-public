/**
 * playwright-bdd のカスタム fixture。
 *
 * playwright-bdd v8 では `test` を "playwright-bdd" から import して extend する。
 * `world` fixture がシナリオ内の Given/When/Then 間で状態を共有する。
 * テスト終了後 world.apiCtx.dispose() が自動実行される（リソースリーク防止）。
 */

import { test as base } from 'playwright-bdd';
import { createBdd } from 'playwright-bdd';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { createAuthenticatedContext, CREDENTIALS } from './auth';

/** teardown 方法（DELETE が実在するか、無い場合は PATCH archive） */
export type TeardownMethod = 'DELETE' | 'PATCH';

export type CreatedResource = {
  method: TeardownMethod;
  /** id を含む full path（例: /api/v1/roles/<id>） */
  path: string;
};

export type World = {
  /** ログイン済み APIRequestContext（セッションクッキーを保持） */
  apiCtx: APIRequestContext | null;
  /** 最後の HTTP レスポンス（Then ステップで検証する） */
  lastResponse: APIResponse | null;
  /** シナリオ内で名前付き保存した補助セッション */
  sessions: Record<string, APIRequestContext>;
  /** fixture teardown で破棄する補助 context */
  auxiliaryContexts: APIRequestContext[];
  /** シナリオ終了時に isActive=true へ必ず復元する seed account id */
  restoreAccountIds: string[];
  /** 現在ログイン中ユーザーの id（P5-04 自己降格防止テスト用） */
  currentUserId: string | null;
  /** シナリオ内で作成し teardown で後始末するリソース（LIFO で処理） */
  createdIds: CreatedResource[];
  /** 一意名生成ヘルパ（path / body の {{key}} プレースホルダ置換用） */
  uniqueNames: Record<string, string>;
};

export const test = base.extend<{ world: World }>({
  world: async ({}, use) => {
    const w: World = {
      apiCtx: null,
      lastResponse: null,
      sessions: {},
      auxiliaryContexts: [],
      restoreAccountIds: [],
      currentUserId: null,
      createdIds: [],
      uniqueNames: {},
    };
    await use(w);
    const needsAdminCleanup = w.createdIds.length > 0 || w.restoreAccountIds.length > 0;
    const cleanupCtx = needsAdminCleanup
      ? await createAuthenticatedContext(CREDENTIALS.admin.email, CREDENTIALS.admin.password)
      : null;

    try {
      // P4-01: 本体が途中失敗しても seed アカウントを必ず復元する。
      for (const accountId of new Set(w.restoreAccountIds)) {
        if (!cleanupCtx) break;
        const res = await cleanupCtx.patch(`/api/v1/members/${accountId}`, {
          data: { isActive: true },
        });
        if (res.status() !== 200) {
          throw new Error(`[teardown] PATCH /api/v1/members/${accountId} failed: ${res.status()}`);
        }
      }

      // 作成リソースを admin context で LIFO 後始末し、失敗を握りつぶさない。
      for (const r of [...w.createdIds].reverse()) {
        if (!cleanupCtx) break;
        const res =
          r.method === 'DELETE'
            ? await cleanupCtx.delete(r.path)
            : await cleanupCtx.patch(r.path, { data: { archived: true } });
        if (res.status() >= 400) {
          throw new Error(`[teardown] ${r.method} ${r.path} failed: ${res.status()}`);
        }
      }
    } finally {
      const contexts = new Set([
        ...w.auxiliaryContexts,
        ...(w.apiCtx ? [w.apiCtx] : []),
        ...(cleanupCtx ? [cleanupCtx] : []),
      ]);
      await Promise.all([...contexts].map((ctx) => ctx.dispose()));
    }
  },
});

export const { Given, When, Then } = createBdd(test);
