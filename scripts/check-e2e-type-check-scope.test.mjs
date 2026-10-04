// cmn-0272 項目2: check-e2e-type-check-scope.mjs のテスト（node --test 形式）。
//
// 「両方向」（criteria #2）: 4 経路のいずれかが外れた時に落ちる／全て含まれる時に緑、の双方を固定する。

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  REQUIRED_E2E_PATHS,
  readInclude,
  globMatch,
  isPathCovered,
} from './check-e2e-type-check-scope.mjs';

test('REQUIRED_E2E_PATHS は 4 経路（steps / support / ui / playwright.config.ts）', () => {
  assert.deepEqual(REQUIRED_E2E_PATHS, ['steps', 'support', 'ui', 'playwright.config.ts']);
});

test('globMatch: 完全リテラル一致', () => {
  assert.equal(globMatch('playwright.config.ts', 'playwright.config.ts'), true);
  assert.equal(globMatch('playwright.config.ts', 'steps/foo.ts'), false);
});

test('globMatch: ** は 0 個以上のセグメントにマッチ', () => {
  assert.equal(globMatch('**/*.ts', 'steps/login.ts'), true);
  assert.equal(globMatch('**/*.ts', 'ui/sso.spec.ts'), true);
  assert.equal(globMatch('**/*.ts', 'a/b/c/d.ts'), true);
  assert.equal(globMatch('**/*.ts', 'login.ts'), true); // ** は 0 セグメントも許容
});

test('globMatch: セグメント内の * はそのセグメント内の 0 個以上の文字にマッチ', () => {
  assert.equal(globMatch('*.ts', 'login.ts'), true);
  assert.equal(globMatch('*.ts', 'sso.spec.ts'), true);
  assert.equal(globMatch('*.ts', 'playwright.config.ts'), true); // *.ts は末尾 .ts なら OK
  assert.equal(globMatch('*.ts', 'login.js'), false);
});

test('globMatch: セグメント数不一致は false', () => {
  assert.equal(globMatch('steps/*.ts', 'steps/auth/login.ts'), false);
  assert.equal(globMatch('a/b', 'a'), false);
});

test('globMatch: セグメント単位の * は単一セグメントのみ', () => {
  assert.equal(globMatch('steps/*.ts', 'steps/login.ts'), true);
  assert.equal(globMatch('steps/*.ts', 'steps/auth/login.ts'), false);
});

test('isPathCovered: 実体無しは covered=false', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    const r = isPathCovered(['**'], 'not-exist', root);
    assert.equal(r.exists, false);
    assert.equal(r.covered, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isPathCovered: ファイルが存在し include=["**/*.ts"] なら covered', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    writeFileSync(join(root, 'playwright.config.ts'), '');
    const r = isPathCovered(['**/*.ts'], 'playwright.config.ts', root);
    assert.equal(r.exists, true);
    assert.equal(r.covered, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isPathCovered: ディレクトリ + include=["**/*.ts"] なら covered（<dir>/**/*.ts 仮想マッチ）', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    mkdirSync(join(root, 'steps'), { recursive: true });
    const r = isPathCovered(['**/*.ts'], 'steps', root);
    assert.equal(r.exists, true);
    assert.equal(r.covered, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isPathCovered: include=["steps/**"] なら support/ui/playwright.config.ts は covered=false', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    mkdirSync(join(root, 'steps'), { recursive: true });
    mkdirSync(join(root, 'support'), { recursive: true });
    mkdirSync(join(root, 'ui'), { recursive: true });
    writeFileSync(join(root, 'playwright.config.ts'), '');
    const include = ['steps/**'];
    assert.equal(isPathCovered(include, 'steps', root).covered, true);
    assert.equal(isPathCovered(include, 'support', root).covered, false);
    assert.equal(isPathCovered(include, 'ui', root).covered, false);
    assert.equal(isPathCovered(include, 'playwright.config.ts', root).covered, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isPathCovered: 現行 e2e の include=["**/*.ts"] で 4 経路全て covered', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    mkdirSync(join(root, 'steps'), { recursive: true });
    mkdirSync(join(root, 'support'), { recursive: true });
    mkdirSync(join(root, 'ui'), { recursive: true });
    writeFileSync(join(root, 'playwright.config.ts'), '');
    for (const req of REQUIRED_E2E_PATHS) {
      const r = isPathCovered(['**/*.ts'], req, root);
      assert.equal(r.exists, true, `${req} exists`);
      assert.equal(r.covered, true, `${req} covered`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readInclude: include が無い場合は TypeScript 既定の ["**/*"] を返す', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    const tsconfigPath = join(root, 'tsconfig.json');
    writeFileSync(tsconfigPath, JSON.stringify({ compilerOptions: { strict: true } }));
    const include = readInclude(tsconfigPath);
    assert.deepEqual(include, ['**/*']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readInclude: include 配列が指定されていればその値を返す', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce2-'));
  try {
    const tsconfigPath = join(root, 'tsconfig.json');
    writeFileSync(tsconfigPath, JSON.stringify({ include: ['steps/**', 'support/**'] }));
    const include = readInclude(tsconfigPath);
    assert.deepEqual(include, ['steps/**', 'support/**']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
