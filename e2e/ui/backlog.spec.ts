/**
 * board iframe 表示スモーク UI-E2E（cmn-0148・ui-sso project）
 *
 * /backlog が明示設定された Instruction Board v2（別プロセス・別オリジン）の画面（/v2.html）を
 * iframe で描画することの薄いスモーク1本。iframe 内の操作ロジックは Board 側の責務のため、
 * ここでは「実ブラウザで iframe が BOARD_URL 起点・v2 画面の src で描画され fallback 通知が出ない」
 * だけを見る。
 *
 * アサート対象（packages/frontend/src/app/backlog/page.tsx）:
 *   - iframe[title="指示ボード（バックログ）"] の存在
 *   - src が `${NEXT_PUBLIC_INSTRUCTION_BOARD_URL}/v2.html`
 *   - 疎通 fallback 通知「指示ボードに接続できません」の非表示（useBoardReachable 供給）
 *
 * iframe 内部（Board v2 画面の中身）はアサートしない（別オリジン検証は脆い・Board 側 node --test の担当）。
 * Board URL未設定または不達時は test.skip で明示スキップ（red にしない）。
 */

import { test, expect, request } from '@playwright/test';

const RETE_FE = 'http://localhost:3010';
const BOARD_URL = process.env.NEXT_PUBLIC_INSTRUCTION_BOARD_URL ?? '';
/** 埋め込む Board v2 の画面（page.tsx の BOARD_PATH と一致させる）。 */
const BOARD_PATH = '/v2.html';

/** rete bootstrap admin（sso.spec.ts と同一資格情報） */
const ADMIN = { email: 'admin@rete.local', password: 'ReteAdmin1234!' };

let boardUp = false;

async function isReachable(url: string): Promise<boolean> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.fetch(url, { timeout: 5_000 });
    return res.status() < 500;
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

test.beforeAll(async () => {
  boardUp = await isReachable(BOARD_URL);
});

test.describe('backlog board iframe スモーク', () => {
  test('/backlog で board v2 iframe が BOARD_URL 起点 src で描画され fallback 通知が出ない', async ({
    page,
  }) => {
    test.skip(
      !BOARD_URL || !boardUp,
      'Instruction Board URL未設定またはBoard未起動 — skip（red にしない）',
    );

    // rete へログイン（sso.spec.ts seamless 経路と同手順）
    await page.goto(`${RETE_FE}/login`);
    await page.locator('#email').fill(ADMIN.email);
    await page.locator('#password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL(`${RETE_FE}/hub`, { timeout: 60_000 });

    // /backlog へ遷移し iframe 描画を確認
    await page.goto(`${RETE_FE}/backlog`);
    const iframe = page.locator('iframe[title="指示ボード（バックログ）"]');
    await expect(iframe).toBeVisible({ timeout: 30_000 });

    // src は BOARD_URL 起点の Board v2 画面
    const src = await iframe.getAttribute('src');
    expect(src).toBe(`${BOARD_URL}${BOARD_PATH}`);

    // 疎通 fallback 通知が出ていない（useBoardReachable が reachable=true を返している）
    await expect(page.getByText('指示ボードに接続できません')).toBeHidden();
  });
});
