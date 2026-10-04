import path from 'path';
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { BASE_URL } from './support/auth';

/**
 * rete E2E テスト設定
 * 権限境界ジャーニーは APIRequestContext（セッションクッキー再利用）で検証する。
 *
 * 認証スロットル対策:
 *   globalSetup で全ユーザーのセッションを事前生成し、
 *   テスト本体ではログイン API を叩かずにセッションクッキーを再利用する。
 *   cmn-0395: 開発機は E2E_THROTTLE_BYPASS=true で素通しにできる（e2e/README.md §前提）。
 *   この事前生成・再利用の構造は素通しを入れていない機械でも落ちないために残す。
 */

const bddConfig = defineBddConfig({
  features: path.join(__dirname, 'features/**/*.feature'),
  steps: [path.join(__dirname, 'steps/**/*.ts'), path.join(__dirname, 'support/fixtures.ts')],
  outputDir: path.join(__dirname, '.cache/bdd'),
});

export default defineConfig({
  testDir: path.join(__dirname, '.cache/bdd'),
  globalSetup: path.join(__dirname, 'support/global-setup.ts'),
  timeout: 30_000,
  retries: 1,
  workers: 1, // ログインスロットル(5req/60s)超過を構造的に防ぐ（cmn-0395: E2E_THROTTLE_BYPASS を入れていない機械向け。素通しを有効にしても外さない＝別の直列前提（順次実行・共用組織名）にも乗っているため）

  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },

  // E2E_REPORTER_MODE=list（scripts/fast-test.mjs の既定）では HTML レポートを出さない。
  // HTML 出力は .report/ へ 0.44MB を書き出す固定コストがあり、普段の赤緑確認には不要。
  // 未設定（素の npx playwright test）の時は従来どおり HTML を出す＝挙動を変えない。
  reporter:
    process.env.E2E_REPORTER_MODE === 'list'
      ? [['list']]
      : [['list'], ['html', { outputFolder: path.join(__dirname, '.report'), open: 'never' }]],

  projects: [
    {
      name: 'authz',
      use: {},
    },
    {
      // SSO 横断ジャーニーの UI-E2E（cmn-0141）。3オリジン跨ぎのため page.goto は localhost 絶対URL。
      // bddgen 生成物（トップレベル testDir = .cache/bdd）と分離するため project レベルで
      // testDir を override（ui/ 配下の通常 spec）。既定 npm test は --project=authz 明示で
      // 本 project を実行しない＝「rete backend のみ起動」前提を機構で維持する。
      name: 'ui-sso',
      testDir: path.join(__dirname, 'ui'),
      timeout: 90_000, // 3オリジンの dev サーバコールドコンパイルを許容
      // rete-top-0006: トップレベル retries:1 を継承しない。OIDC 失敗をリトライすると
      // 新しい interaction が生成され、最悪 4 attempts/60s まで膨らむ（失敗の再現性も落ちる）。
      // 待ちは要素ベース（下記 spec）で担保し、リトライには頼らない。
      retries: 0,
      use: {
        browserName: 'chromium',
        // rete-top-0006: トップレベル use.baseURL（rete backend 3011）を継承しない。
        // ui-sso は 3オリジン跨ぎで page.goto に localhost 絶対URLを使う前提のため、
        // 相対 goto を書くと 3011 を踏んで無音で失敗する footgun を機構で塞ぐ
        // （baseURL 未定義 → 相対 goto は即エラーになる）。
        baseURL: undefined,
      },
    },
  ],
});
