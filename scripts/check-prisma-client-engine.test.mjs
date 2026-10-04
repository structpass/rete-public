// cmn-0321: @prisma/client 生成物が Data Proxy モード (engineType=dataProxy) で生成され
// ていると、backend 起動時に P6001 (InvalidDatasourceError) で落ちる＝SSO 全面停止。
// 実行環境に PRISMA_CLIENT_ENGINE_TYPE 等が紛れても生成物が壊れない様を
// (a) 生成入口 2 つ (pretest / prisma:generate) で library 固定
// (b) 生成物が library でない時は check:repo-invariants が赤
// で二重に押さえる。本検査は (b) 側。
//
// 設計の根拠 (cmn-0321 plan_notes より):
//   - リポ内に engineType 設定は 0 件 (prisma.config.ts も存在しない)
//   - 生成物モードは生成時の実行環境で決まり、事後の原因確定は不能
//   - 「紛れても壊れない・壊れたら気づく」の二段で閉じる
//
// 判定は 2 点 (両方ないと将来の形式変更で無言化する):
//   1. index.js に engineType: "library" が書かれていること
//   2. 通常モードのクエリエンジン本体 (query_engine-*.node) が同梱されていること
// 生成物が無い時は skip + 理由をログに出す (cmn-0261 前例に揃える)＝
// 未生成状態で偽の赤を出さない。

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const BACKEND_DIR = join(REPO_ROOT, 'packages', 'backend');

/**
 * @prisma/client 生成物のディレクトリを解決する。
 * pnpm のハッシュ付きディレクトリ名に依存しないため、packages/backend の
 * node_modules から再帰的に ".prisma/client" を探す。見つからなければ null。
 * @returns {string|null}
 */
function findPrismaClientDir() {
  const backendNm = join(BACKEND_DIR, 'node_modules');
  if (!existsSync(backendNm)) return null;
  const candidates = [];
  // pnpm 形式: node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client
  const pnpmDir = join(backendNm, '.pnpm');
  if (existsSync(pnpmDir)) {
    for (const entry of readdirSync(pnpmDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('@prisma+client')) continue;
      const probe = join(pnpmDir, entry.name, 'node_modules', '.prisma', 'client');
      if (existsSync(probe)) candidates.push(probe);
    }
  }
  // 直接 hoist 形式: node_modules/.prisma/client
  const hoisted = join(backendNm, '.prisma', 'client');
  if (existsSync(hoisted)) candidates.push(hoisted);
  return candidates[0] || null;
}

/**
 * 生成物 index.js から engineType を抽出する。
 * 書かれていなければ null (=判定不能)。
 * @param {string} clientDir
 * @returns {{engineType: string|null, raw: string}}
 */
function readEngineType(clientDir) {
  const indexPath = join(clientDir, 'index.js');
  if (!existsSync(indexPath)) return { engineType: null, raw: '' };
  const raw = readFileSync(indexPath, 'utf8');
  // 例: engineType: "library" / engineType: 'dataProxy'
  const m = raw.match(/engineType\s*:\s*["']([^"']+)["']/);
  return { engineType: m ? m[1] : null, raw };
}

/**
 * 同梱されているクエリエンジン本体を探す。
 * 通常モード (library) なら query_engine-windows.dll.node / query_engine-darwin-arm64.dylib / ...
 * 等のいずれかが同梱されている。Data Proxy モードならこれらは無い (dataProxy は
 * クライアントがリモートエンジンへ接続するためローカル同梱不要)。
 * @param {string} clientDir
 * @returns {string[]}
 */
function findEngineBinaries(clientDir) {
  if (!existsSync(clientDir)) return [];
  return readdirSync(clientDir).filter((name) => name.startsWith('query_engine-'));
}

test('check:prisma-client-engine — 生成物が存在し library モード (cmn-0321)', () => {
  const clientDir = findPrismaClientDir();
  if (!clientDir) {
    // 生成物が無い = フレッシュクローン or 依存未インストール。
    // check-knip-baseline と同じ前例で skip（黙って緑にしない）。
    console.log(
      '[check:prisma-client-engine] skip: @prisma/client 生成物が見つかりません ' +
        '(`pnpm install` 後に `pnpm run prisma:generate` を実行してから再走させてください)',
    );
    return;
  }

  const { engineType, raw } = readEngineType(clientDir);
  const engines = findEngineBinaries(clientDir);

  // 失敗文言は「次の一手」と「backend 起動不能・reference の SSO 停止への波及」を含める (criteria 5)。
  const remediation =
    '修正: cd packages/backend && pnpm run prisma:generate を実行し、' +
    '生成物が library モードで再生成されていることを確認してください。' +
    'この故障は backend 起動不能 (P6001) → reference の SSO ログイン全面停止に直結します。';

  assert.ok(
    raw.length > 0,
    `生成物の index.js が空です=${clientDir}/index.js が壊れている可能性があります。${remediation}`,
  );

  assert.equal(
    engineType,
    'library',
    `@prisma/client 生成物の engineType が "library" ではありません (実際: ${engineType ?? 'undefined'})。` +
      `Data Proxy モードで生成されているため backend 起動時に P6001 で落ちます。${remediation}`,
  );

  assert.ok(
    engines.length > 0,
    `クエリエンジン本体 (query_engine-*.node 等) が同梱されていません。` +
      `library モードでは必須なので、生成物が壊れているか別モードで生成されています。${remediation}`,
  );
});

test('check:prisma-client-engine — packages/backend の pretest / prisma:generate が library 固定 (cmn-0321 criteria 1)', () => {
  const pkgPath = join(BACKEND_DIR, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};

  // pretest と prisma:generate の両方が cross-env PRISMA_CLIENT_ENGINE_TYPE=library で
  // 始めること。片方だけだと「テストだけ OK・運用だけ壊れる」の片側落ちが起きる。
  const requiredScripts = ['pretest', 'prisma:generate'];
  for (const name of requiredScripts) {
    const script = scripts[name];
    assert.ok(
      typeof script === 'string',
      `packages/backend/package.json に scripts.${name} がありません`,
    );
    assert.ok(
      /cross-env/.test(script) && /PRISMA_CLIENT_ENGINE_TYPE\s*=\s*library/.test(script),
      `scripts.${name} が cross-env PRISMA_CLIENT_ENGINE_TYPE=library 固定ではありません ` +
        `(実際: "${script}")。実行環境の env に左右されず library モードで生成させるために明示固定が必要です。`,
    );
  }
});
