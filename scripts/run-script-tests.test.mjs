// cmn-0337: 検査ランナー（run-script-tests.mjs）の REQUIRED_TESTS 名簿を実体と突き合わせる。
//
// なぜ必要か: REQUIRED_TESTS は「既知の検査が改名・削除で静かに減る」ことを検出する名簿。
// 名前を間違えて書くと、本来の検査が実在するのに「存在しない」と誤検出して常時赤になる。
// ここで「名簿の各名が実在ファイルを指すこと」と「名簿が実際の検査群と食い違っていないこと」を
// 固定する（名簿の追加漏れはここでは検出しない＝新規検査は自動探索で走る設計のため）。

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUIRED_TESTS, EXCLUDED, allTestFiles, snapshotExcludes } from './run-script-tests.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('REQUIRED_TESTS の各名が scripts/ に実在する（cmn-0337）', () => {
  for (const name of REQUIRED_TESTS) {
    if (snapshotExcludes(name)) continue; // 公開スナップショット文脈（scripts/publish/ 不在）では不在を許容
    assert.ok(
      allTestFiles.includes(name),
      `REQUIRED_TESTS の ${name} が scripts/ に存在しません（改名・移動なら REQUIRED_TESTS も直してください）`,
    );
  }
});

test('延期する必須seed検査は名簿とinstall後の実行先を保持する (v2-373)', () => {
  assert.ok(REQUIRED_TESTS.includes('check-seed-guards.test.mjs'));
  assert.match(
    EXCLUDED.get('check-seed-guards.test.mjs'),
    /Install dependencies.*Seed guard checks/,
  );
});

test('install後専用stepへ延期する必須検査は名簿と実行先を保持する', () => {
  assert.ok(REQUIRED_TESTS.includes('check-root-dependency-fixes.test.mjs'));
  assert.match(
    EXCLUDED.get('check-root-dependency-fixes.test.mjs'),
    /Dependency security regressions.*Install dependencies/,
  );
});

test('依存回帰テストはinstall後のCI security stepから実行される', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/test.yml'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const invariant = workflow.indexOf('run: pnpm run check:repo-invariants');
  const install = workflow.indexOf('pnpm install --frozen-lockfile');
  const security = workflow.indexOf('run: pnpm run test:security');
  assert.ok(
    invariant >= 0 && install > invariant,
    'repo invariant checksは依存install前に実行する',
  );
  assert.ok(security > install, 'dependency security regressionsはinstall後に実行する');

  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(
    packageJson.scripts['test:security'].includes('scripts/check-root-dependency-fixes.test.mjs'),
    'test:securityから依存回帰テストが消えています',
  );
});

test('REQUIRED_TESTS と EXCLUDED の重複は専用post-install stepを持つ検査のみ', () => {
  for (const name of REQUIRED_TESTS) {
    if (['check-seed-guards.test.mjs', 'check-root-dependency-fixes.test.mjs'].includes(name))
      continue;
    assert.ok(
      !EXCLUDED.has(name),
      `${name} が REQUIRED_TESTS と EXCLUDED の両方に載っています（片方にしてください）`,
    );
  }
});
